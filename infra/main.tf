terraform {
  required_version = ">= 1.5.0"

  # Backend is configured per-env via -backend-config=backend/<env>.tfbackend
  # at `terraform init` time — keeps a single root module deploying to N envs.
  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  # AWS credentials sourced from AWS_PROFILE env var. Set it before running terraform:
  #   AWS_PROFILE=myrecruiter-staging terraform plan -var-file=envs/staging.tfvars
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.env
      ManagedBy   = "terraform"
      Project     = "myrecruiter"
    }
  }
}

module "session_summaries" {
  source = "./modules/ddb-session-summaries"
  env    = var.env
}
