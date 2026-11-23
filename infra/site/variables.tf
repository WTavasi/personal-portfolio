variable "aws_region" {
  description = "Region for the bucket and budget. us-east-1 also suits CloudFront certificates later."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Short name used in resource names."
  type        = string
  default     = "wyclef-portfolio"
}

variable "environment" {
  description = "staging or production."
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "github_repository" {
  description = "owner/name of the repository allowed to deploy."
  type        = string
  default     = "WTavasi/personal-portfolio"
}

variable "deploy_branches" {
  description = "Branches whose GitHub Actions runs may deploy this environment."
  type        = list(string)
  default     = ["feature/portfolio-redesign"]
}

variable "create_github_oidc_provider" {
  description = "The GitHub OIDC provider exists once per AWS account: true for the first environment, false after."
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Where budget alerts go. Set it in terraform.tfvars, which git ignores; never commit it."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Alert when actual or forecast monthly spend passes this."
  type        = number
  default     = 1
}
