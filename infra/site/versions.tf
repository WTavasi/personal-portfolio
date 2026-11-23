terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.80"
    }
  }

  # State lives in the bucket made by infra/bootstrap. The bucket name and key come from
  # backend.hcl (see backend.hcl.example), so one configuration serves staging and production.
  # use_lockfile gives state locking in S3 itself, with no DynamoDB table.
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
