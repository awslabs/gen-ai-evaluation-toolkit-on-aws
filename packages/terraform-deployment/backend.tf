terraform {
  # Partial backend config — concrete values (bucket, key, region, lock table)
  # are injected at `terraform init` time via `-backend-config=backend.hcl`
  # (generated per AWS profile by scripts/gen-backend-hcl.sh).
  backend "s3" {
    encrypt = true
  }
}
