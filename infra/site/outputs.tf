# Copy the first four into the repository's Actions variables (see infra/README.md).

output "AWS_DEPLOY_ROLE_ARN" {
  value = aws_iam_role.deploy.arn
}

output "AWS_REGION" {
  value = var.aws_region
}

output "STAGING_BUCKET" {
  value = aws_s3_bucket.site.bucket
}

output "STAGING_DISTRIBUTION_ID" {
  value = aws_cloudfront_distribution.site.id
}

output "site_url" {
  description = "Where the site is served."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}
