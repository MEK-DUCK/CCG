# Admin User Setup for Render Deployment

## Option 1: Using Render Shell (Recommended)

1. Go to your Render dashboard
2. Click on your backend service
3. Click on "Shell" tab
4. Run these commands:

```bash
cd /opt/render/project/src/backend
source venv/bin/activate  # or python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python create_admin.py
```

If admin already exists, run:
```bash
python update_admin_password.py
```

## Option 2: Using Render Environment Variables

You can also create the admin user by setting these environment variables and adding a startup script, but Option 1 is simpler.

## CORS Configuration

Make sure to set the `ALLOWED_ORIGINS` environment variable in Render to include your Vercel domain:

1. Go to Render dashboard → Your backend service → Environment
2. Add or update `ALLOWED_ORIGINS`:
   - Value: `https://your-vercel-app.vercel.app` (replace with your actual Vercel URL)
   - If you have multiple origins, separate with commas: `https://app1.vercel.app,https://app2.vercel.app`

3. Redeploy the backend service after setting the environment variable

## Admin Credentials

- **Email:** admin@admin.com
- **Password:** admin
- **Initials:** ADM
- **Role:** Admin

