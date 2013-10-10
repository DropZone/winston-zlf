DO NOT CHANGE config - production and staging folders' names

----------------------------------------------------------------------------//----------------------------------------------------------------------------

-- Step-by-step for deployment
Open powershell as administrator
F:
cd F:\AppAzureSee
-- production deployment
& '.\Production Deployment.ps1'
-- staging deployment
& '.\Staging Deployment.ps1'

----------------------------------------------------------------------------//----------------------------------------------------------------------------

If you want to change production or staging config files just go to F:\AppAzureSee\config - [environment]