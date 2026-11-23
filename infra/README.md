# Infrastructure

The site's AWS setup, written in Terraform so it can be rebuilt from this folder alone. Stage S1 of the redesign: a staging copy of the site served from AWS. Design notes and costs are in the redesign document (section 12).

| Folder | Creates | Run |
|---|---|---|
| `bootstrap/` | The private, versioned S3 bucket that stores Terraform's state | Once, ever |
| `site/` | Private site bucket, CloudFront (HTTPS, caching, security headers, path rewrite), the GitHub Actions deploy role, a $1 monthly budget alarm | Once per environment, and after any change here |

Expected cost at portfolio traffic: $0 (CloudFront's always-free 1 TB and 10 million requests a month, S3 pennies). The budget alarm emails you if actual or forecast spend for a month passes $1.

## What you need

- Terraform 1.10 or newer and the AWS CLI, on your own computer.
- The AWS CLI signed in as an administrator user with multi-factor sign-in, **not the root account**. AWS IAM Identity Center is the simplest way: create a user with the AdministratorAccess permission set, then sign in with the command below.

```bash
aws configure sso
```

## First-time setup (about 15 minutes, most of it CloudFront deploying)

1. Create the state bucket and note the `state_bucket` it prints.

```bash
cd infra/bootstrap && terraform init && terraform apply
```

2. Configure the site. Copy the two examples and fill them in (both files are ignored by git, so your email never reaches the repository).

```bash
cd ../site && cp backend.hcl.example backend.hcl && cp terraform.tfvars.example terraform.tfvars
```

3. Create the staging site. Review the plan before typing `yes`.

```bash
terraform init -backend-config=backend.hcl && terraform apply
```

4. In GitHub, open the repository's Settings, then Secrets and variables, then Actions, then the Variables tab. Add four repository variables with the values `terraform apply` printed: `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `STAGING_BUCKET`, `STAGING_DISTRIBUTION_ID`. None of them is a secret.

5. Push to `feature/portfolio-redesign`, or run "Deploy to AWS staging" from the Actions tab. The site appears at the `site_url` output.

## Later

- **Production:** a second `backend.hcl` with `key = "site/production.tfstate"`, `environment = "production"`, `deploy_branches = ["main"]` and `create_github_oidc_provider = false` (the provider is shared by the account). The custom domain and its certificate are added in stage S5.
- **Changes:** edit the `.tf` files, run `terraform plan` to see exactly what will change, then `terraform apply`.
- **Removing everything:** `terraform destroy` in `site/` (empty the site bucket first), then in `bootstrap/`.
