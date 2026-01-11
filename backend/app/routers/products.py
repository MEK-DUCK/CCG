"""
Products router - Admin management of available products.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import asc
from typing import List
from app.database import get_db
from app import models, schemas
from app.general_audit_utils import log_general_action
from app.auth import require_auth
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/", response_model=schemas.Product)
def create_product(
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Create a new product."""
    try:
        # Check for duplicate code
        existing_code = db.query(models.Product).filter(
            models.Product.code == product.code.upper()
        ).first()
        if existing_code:
            raise HTTPException(status_code=400, detail=f"Product with code '{product.code}' already exists")
        
        # Check for duplicate name
        existing_name = db.query(models.Product).filter(
            models.Product.name == product.name
        ).first()
        if existing_name:
            raise HTTPException(status_code=400, detail=f"Product with name '{product.name}' already exists")
        
        db_product = models.Product(
            code=product.code.upper(),
            name=product.name,
            description=product.description,
            is_active=product.is_active,
            sort_order=product.sort_order
        )
        db.add(db_product)
        db.flush()
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='PRODUCT',
            action='CREATE',
            entity_id=db_product.id,
            entity_name=db_product.name,
            description=f"Created product: {db_product.name} ({db_product.code})"
        )
        
        db.commit()
        db.refresh(db_product)
        
        logger.info(f"Product created: {db_product.code} - {db_product.name}")
        return db_product
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating product: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating product: {str(e)}")


@router.get("/", response_model=List[schemas.Product])
def read_products(
    include_inactive: bool = Query(False, description="Include inactive products"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Get all products, ordered by sort_order then name."""
    try:
        query = db.query(models.Product)
        if not include_inactive:
            query = query.filter(models.Product.is_active == True)
        products = query.order_by(asc(models.Product.sort_order), asc(models.Product.name)).all()
        return products
    except Exception as e:
        logger.error(f"Error fetching products: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching products: {str(e)}")


@router.get("/names", response_model=List[str])
def read_product_names(
    include_inactive: bool = Query(False, description="Include inactive products"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Get just the product names for dropdowns."""
    try:
        query = db.query(models.Product.name)
        if not include_inactive:
            query = query.filter(models.Product.is_active == True)
        products = query.order_by(asc(models.Product.sort_order), asc(models.Product.name)).all()
        return [p.name for p in products]
    except Exception as e:
        logger.error(f"Error fetching product names: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching product names: {str(e)}")


@router.get("/{product_id}", response_model=schemas.Product)
def read_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Get a specific product by ID."""
    try:
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return product
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching product {product_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching product: {str(e)}")


@router.put("/{product_id}", response_model=schemas.Product)
def update_product(
    product_id: int,
    product: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Update a product."""
    try:
        db_product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not db_product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # Check for duplicate code if being changed
        if product.code and product.code.upper() != db_product.code:
            existing = db.query(models.Product).filter(
                models.Product.code == product.code.upper(),
                models.Product.id != product_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Product with code '{product.code}' already exists")
        
        # Check for duplicate name if being changed
        if product.name and product.name != db_product.name:
            existing = db.query(models.Product).filter(
                models.Product.name == product.name,
                models.Product.id != product_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Product with name '{product.name}' already exists")
        
        # Update fields
        update_data = product.model_dump(exclude_unset=True)
        if 'code' in update_data:
            update_data['code'] = update_data['code'].upper()
        
        for field, value in update_data.items():
            old_value = getattr(db_product, field, None)
            if old_value != value:
                log_general_action(
                    db=db,
                    entity_type='PRODUCT',
                    action='UPDATE',
                    entity_id=db_product.id,
                    entity_name=db_product.name,
                    field_name=field,
                    old_value=old_value,
                    new_value=value
                )
            setattr(db_product, field, value)
        
        db.commit()
        db.refresh(db_product)
        
        logger.info(f"Product updated: {db_product.code} - {db_product.name}")
        return db_product
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating product {product_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating product: {str(e)}")


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Delete a product. Consider using is_active=false instead for products in use."""
    try:
        db_product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not db_product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        product_name = db_product.name
        product_code = db_product.code
        
        # Audit log
        log_general_action(
            db=db,
            entity_type='PRODUCT',
            action='DELETE',
            entity_id=db_product.id,
            entity_name=product_name,
            description=f"Deleted product: {product_name} ({product_code})",
            entity_snapshot={
                'id': db_product.id,
                'code': product_code,
                'name': product_name,
                'description': db_product.description,
                'is_active': db_product.is_active
            }
        )
        
        db.delete(db_product)
        db.commit()
        
        logger.info(f"Product deleted: {product_name}")
        return {"message": f"Product '{product_name}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting product {product_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting product: {str(e)}")


@router.post("/seed-defaults")
def seed_default_products(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_auth),
):
    """Seed the database with default products if none exist."""
    try:
        existing = db.query(models.Product).count()
        if existing > 0:
            return {"message": f"Products already exist ({existing} products). Skipping seed."}
        
        default_products = [
            {"code": "JETA1", "name": "JET A-1", "description": "Aviation turbine fuel", "sort_order": 1},
            {"code": "GASOIL", "name": "GASOIL", "description": "Diesel fuel", "sort_order": 2},
            {"code": "GASOIL10", "name": "GASOIL 10PPM", "description": "Ultra-low sulfur diesel (10ppm)", "sort_order": 3},
            {"code": "HFO", "name": "HFO", "description": "Heavy fuel oil", "sort_order": 4},
            {"code": "LSFO", "name": "LSFO", "description": "Low sulfur fuel oil", "sort_order": 5},
        ]
        
        for p in default_products:
            db_product = models.Product(
                code=p["code"],
                name=p["name"],
                description=p["description"],
                is_active=True,
                sort_order=p["sort_order"]
            )
            db.add(db_product)
        
        db.commit()
        logger.info(f"Seeded {len(default_products)} default products")
        return {"message": f"Successfully seeded {len(default_products)} default products"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding default products: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error seeding products: {str(e)}")

