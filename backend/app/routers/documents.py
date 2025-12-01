from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pathlib import Path
from io import BytesIO
import tempfile
import os
from datetime import datetime
from app.database import get_db
from app import models
import json

router = APIRouter()

def get_sheet_name_for_product(product_name: str, customer_name: str) -> str:
    """Determine which sheet to use based on product and customer"""
    product_lower = product_name.lower()
    customer_lower = customer_name.lower()
    
    # Check for KPCT customer
    if 'kpct' in customer_lower or 'kpc trading' in customer_lower:
        if 'jet' in product_lower or 'gas' in product_lower:
            return 'KPCT Gas-Jet'
        else:
            return 'KPCT Gas-Jet'  # Default for KPCT
    
    # Check product type
    if 'jet' in product_lower or 'gas' in product_lower:
        return 'Gas-Jet'
    elif 'fuel' in product_lower or 'hfo' in product_lower or 'heavy fuel' in product_lower:
        return 'Fuel'
    else:
        # Default to Gas-Jet
        return 'Gas-Jet'

def get_reference_data(db: Session, contract_number: str, customer_name: str):
    """Get reference data from the Reference sheet"""
    template_path = Path(__file__).parent.parent.parent / "templates" / "nomination_template.xlsx"
    from openpyxl import load_workbook
    
    wb = load_workbook(template_path, data_only=True)
    if 'Reference' not in wb.sheetnames:
        return None, None, None
    
    ws_ref = wb['Reference']
    
    # Search for matching contract/customer
    for row in range(2, ws_ref.max_row + 1):
        ref_contract = ws_ref.cell(row, 1).value or ''  # Column A: Contract type
        ref_name = ws_ref.cell(row, 2).value or ''  # Column B: Reference
        ref_full_name = ws_ref.cell(row, 3).value or ''  # Column C: Full name
        ref_md = ws_ref.cell(row, 4).value or ''  # Column D: MD reference
        ref_indicator = ws_ref.cell(row, 10).value or ''  # Column J: Indicator
        
        # Match by contract number or customer name
        if (contract_number and contract_number.lower() in str(ref_name).lower()) or \
           (customer_name and customer_name.lower() in str(ref_full_name).lower()):
            return ref_md, ref_indicator, ref_full_name
    
    return None, None, None

def get_inspector_info(db: Session, customer_name: str, inspector_name: str):
    """Get inspector info from LIST sheet"""
    template_path = Path(__file__).parent.parent.parent / "templates" / "nomination_template.xlsx"
    from openpyxl import load_workbook
    
    wb = load_workbook(template_path, data_only=True)
    if 'LIST ' not in wb.sheetnames:
        return None, None
    
    ws_list = wb['LIST ']
    
    # Search for customer in LIST sheet
    for row in range(2, ws_list.max_row + 1):
        list_customer = ws_list.cell(row, 3).value or ''  # Column C: Customer List
        list_inspector = ws_list.cell(row, 8).value or ''  # Column H: Inspector
        list_code = ws_list.cell(row, 9).value or ''  # Column I: Code
        list_spec = ws_list.cell(row, 10).value or ''  # Column J: Spec
        
        if customer_name and customer_name.lower() in str(list_customer).lower():
            # If inspector matches, return code and spec
            if inspector_name and inspector_name.lower() in str(list_inspector).lower():
                return list_code, list_spec
            # Otherwise return first match
            if not inspector_name:
                return list_code, list_spec
    
    return None, None

@router.get("/cargos/{cargo_id}/nomination")
def generate_nomination_excel(cargo_id: int, db: Session = Depends(get_db)):
    """Generate nomination Excel file for a specific cargo"""
    # Get cargo data
    cargo = db.query(models.Cargo).filter(models.Cargo.id == cargo_id).first()
    if not cargo:
        raise HTTPException(status_code=404, detail="Cargo not found")
    
    # Get contract
    contract = db.query(models.Contract).filter(models.Contract.id == cargo.contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    # Get customer
    customer = db.query(models.Customer).filter(models.Customer.id == cargo.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Get monthly plan for laycan info
    monthly_plan = db.query(models.MonthlyPlan).filter(models.MonthlyPlan.id == cargo.monthly_plan_id).first()
    
    # Load Excel template
    template_path = Path(__file__).parent.parent.parent / "templates" / "nomination_template.xlsx"
    if not template_path.exists():
        raise HTTPException(status_code=500, detail=f"Nomination template not found at {template_path}")
    
    from openpyxl import load_workbook
    # Load template directly - keep original structure
    # Use keep_vba=False to avoid file corruption issues
    wb = load_workbook(template_path, read_only=False, keep_vba=False, data_only=False)
    
    # Remove external links to avoid security warnings
    # Clear external references if they exist
    if hasattr(wb, 'external_references'):
        wb.external_references = []
    if hasattr(wb, '_external_links'):
        wb._external_links = []
    
    # Determine which sheet to use
    sheet_name = get_sheet_name_for_product(cargo.product_name, customer.name)
    if sheet_name not in wb.sheetnames:
        # Fallback to first available template sheet
        available_sheets = [s for s in wb.sheetnames if s not in ['Reference', 'LIST ']]
        if not available_sheets:
            raise HTTPException(status_code=500, detail="No template sheet found")
        sheet_name = available_sheets[0]
    
    ws = wb[sheet_name]
    
    # Get reference data
    md_reference, indicator, ref_full_name = get_reference_data(db, contract.contract_number, customer.name)
    
    # Get inspector info
    inspector_code, spec_code = get_inspector_info(db, customer.name, cargo.inspector_name or '')
    
    # Fill in the template
    # Note: A4 (Date/Header) is kept as is in template - don't change it
    
    # ITEM (Row 22, Column C) - put red text "Enter Item Number"
    from openpyxl.styles import Font
    cell_c22 = ws['C22']
    cell_c22.value = 'Enter Item Number'
    if cell_c22.font is None:
        cell_c22.font = Font(color='FF0000')
    else:
        cell_c22.font = Font(color='FF0000', size=cell_c22.font.size, name=cell_c22.font.name)
    
    # LAYDAYS (Row 22, Columns G-H)
    laycan = cargo.laycan_window or ''
    if monthly_plan:
        if contract.contract_type.value == 'FOB':
            laycan = monthly_plan.laycan_2_days or monthly_plan.laycan_5_days or laycan
        else:
            laycan = cargo.laycan_window or laycan
    
    if laycan and laycan != 'TBA' and laycan != '-':
        # Try to parse laycan (e.g., "21-22/11" or "20-21/11/2025")
        import re
        match = re.search(r'(\d{1,2})-(\d{1,2})/(\d{1,2})', laycan)
        if match:
            day1, day2, month = match.groups()
            ws['G22'] = f'({day1}-{day2}/{month})'
        else:
            ws['G22'] = laycan
    else:
        ws['G22'] = 'TBA'
    
    # H22 - keep empty (no text)
    ws['H22'] = ''
    
    # VESSEL (Row 23, Column C)
    ws['C23'] = cargo.vessel_name
    
    # ETA KUWAIT (Row 23, Column G)
    eta = cargo.eta or 'TBA'
    ws['G23'] = eta
    
    # PRODUCT (Row 24, Column C)
    ws['C24'] = cargo.product_name
    
    # Delivery (Row 24, Column G) - FOB or CIF
    ws['G24'] = contract.contract_type.value
    
    # QUANTITY (Row 25, Column C) - remove .0 if whole number
    quantity = cargo.cargo_quantity
    if quantity == int(quantity):
        quantity_str = f"{int(quantity)} KT +/- 10%"
    else:
        quantity_str = f"{quantity} KT +/- 10%"
    ws['C25'] = quantity_str
    
    # Parse load ports once for reuse
    load_ports = cargo.load_ports or ''
    ports_list = []
    if load_ports:
        # Handle both comma and slash separators
        if ',' in load_ports:
            ports_list = [p.strip() for p in load_ports.split(',')]
        elif '/' in load_ports:
            ports_list = [p.strip() for p in load_ports.split('/')]
        else:
            ports_list = [load_ports.strip()]
    
    # Load ports in G7 to G14 (header section) - fill these with load ports
    # Note: G8 is kept as "KWT" - skip it
    # G9, G11, G13 should be the same as G7 (first port)
    if ports_list:
        first_port = ports_list[0] if ports_list else ''
        
        # G7 gets first port
        ws['G7'] = first_port
        
        # G9, G11, G13 get the same as G7 (first port)
        ws['G9'] = first_port
        ws['G11'] = first_port
        ws['G13'] = first_port
        
        # G10, G12, G14 get subsequent ports if available
        if len(ports_list) > 1:
            ws['G10'] = ports_list[1] if len(ports_list) > 1 else ''
        if len(ports_list) > 2:
            ws['G12'] = ports_list[2] if len(ports_list) > 2 else ''
        if len(ports_list) > 3:
            ws['G14'] = ports_list[3] if len(ports_list) > 3 else ''
    
    # Load ports info (Row 25, Column D and Row 26, Column C)
    if ports_list:
        if len(ports_list) == 1:
            ws['D25'] = f'(AS PER MASTER REQUEST) to be fully loaded Ex. {ports_list[0]}'
        elif len(ports_list) == 2:
            ws['D25'] = f'(AS PER MASTER REQUEST) to be Loaded as follows: '
            ws['C26'] = f' 1ST PORT: {ports_list[0]}\n 2ND PORT: Balance Quantity Ex. {ports_list[1]}'
        else:
            ws['D25'] = f'(AS PER MASTER REQUEST) to be loaded from: {load_ports}'
    
    # INSPECTOR (Row 28, Column C)
    inspector = cargo.inspector_name or 'TBA'
    ws['C28'] = inspector
    
    # CHARGES (Row 28, Column G-H) - Split customer name
    customer_name_parts = customer.name.split()
    if len(customer_name_parts) > 0:
        ws['G28'] = '50/50 KPC/ '
        ws['H28'] = customer_name_parts[0] if len(customer_name_parts) > 0 else customer.name
    else:
        ws['G28'] = '50/50 KPC/ '
        ws['H28'] = customer.name
    
    # SAMPLING KPC PROCEDURE (Row 29, Column C) - based on product type
    product_lower = cargo.product_name.lower().strip()
    # Check for gasoil (including "gasoil 10ppm" or "gasoil 10 ppm" variations)
    if 'gasoil' in product_lower:
        ws['C29'] = 'G-001'
    # Check for JET-A1
    elif 'jet' in product_lower and ('a1' in product_lower or 'a-1' in product_lower):
        ws['C29'] = 'K-001'
    else:
        # Default fallback to K-001
        ws['C29'] = 'K-001'
    
    # SPEC (Row 29, Column G) - from reference or inspector info
    if spec_code:
        ws['G29'] = spec_code
    else:
        # Default based on product
        product_lower = cargo.product_name.lower()
        if 'jet' in product_lower or 'gas' in product_lower:
            ws['G29'] = '3001-A'
        elif 'fuel' in product_lower or 'hfo' in product_lower:
            ws['G29'] = '5325 M'
        else:
            ws['G29'] = '3001-A'
    
    # CUSTOMER (Row 30, Column C)
    ws['C30'] = customer.name
    
    # CONTRACT NO. (Row 30, Column G)
    ws['G30'] = f'({contract.contract_number})'
    
    # Save workbook - use temporary file first to ensure proper Excel format
    temp_file_path = None
    try:
        # Ensure external links are removed before saving
        if hasattr(wb, 'external_references'):
            wb.external_references = []
        if hasattr(wb, '_external_links'):
            wb._external_links = []
        
        # Create temporary file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        temp_file_path = temp_file.name
        temp_file.close()
        
        # Save workbook to temporary file with write_only=False
        try:
            wb.save(temp_file_path)
        except Exception as save_error:
            wb.close()
            raise HTTPException(status_code=500, detail=f"Error saving Excel file: {str(save_error)}")
        
        wb.close()  # Close workbook immediately after saving
        
        # Verify file was created and has content
        if not os.path.exists(temp_file_path):
            raise HTTPException(status_code=500, detail="Failed to generate Excel file - file not created")
        
        file_size = os.path.getsize(temp_file_path)
        if file_size == 0:
            raise HTTPException(status_code=500, detail="Failed to generate Excel file - file is empty")
        
        # Validate it's a valid Excel file (check for ZIP signature - Excel files are ZIP archives)
        with open(temp_file_path, 'rb') as f:
            first_bytes = f.read(4)
            f.seek(0)  # Reset for later reading
            if first_bytes != b'PK\x03\x04':  # ZIP file signature
                raise HTTPException(status_code=500, detail="Generated file is not a valid Excel file")
        
        # Read the file content (file handle already open from validation, but we closed it)
        with open(temp_file_path, 'rb') as f:
            file_content = f.read()
        
        # Generate filename: vessel_name_customer_name_contract_number_load_port
        # Clean up names for filename (remove special characters)
        vessel_name_clean = (cargo.vessel_name or 'TBA').replace(' ', '_').replace('/', '_').replace('\\', '_').replace(':', '_')
        customer_name_clean = (customer.name or 'TBA').replace(' ', '_').replace('/', '_').replace('\\', '_').replace(':', '_')
        contract_number_clean = (contract.contract_number or 'TBA').replace(' ', '_').replace('/', '_').replace('\\', '_').replace(':', '_')
        # Get first load port or use TBA
        load_ports_str = cargo.load_ports or 'TBA'
        first_port = load_ports_str.split(',')[0].split('/')[0].strip() if load_ports_str != 'TBA' else 'TBA'
        load_port_clean = first_port.replace(' ', '_').replace('/', '_').replace('\\', '_').replace(':', '_')
        
        filename = f"{vessel_name_clean}_{customer_name_clean}_{contract_number_clean}_{load_port_clean}.xlsx"
        
        # Clean up temporary file
        try:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        except:
            pass
        
        # Return file as response
        # Use filename* for proper UTF-8 encoding support
        return Response(
            content=file_content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(file_content))
            }
        )
    except Exception as e:
        # Ensure workbook is closed even on error
        try:
            wb.close()
        except:
            pass
        # Clean up temporary file on error
        try:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Error generating Excel file: {str(e)}")

