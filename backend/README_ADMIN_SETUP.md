# Admin User Setup for Render Deployment

## Automatic Setup

Admin and test users are **automatically created** when the backend starts via `startup.py`.

The following users are created automatically:
- **Admin:** admin@admin.com / admin (Initials: ADM)
- **Test Users:** mek@test.com, azn@test.com, mfo@test.com, na@test.com (Password: password)

No manual setup is required!

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
