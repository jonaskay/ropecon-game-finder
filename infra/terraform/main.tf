terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "7.40.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "2.9.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.9.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "random_id" "default" {
  byte_length = 8
}

resource "google_storage_bucket" "backend" {
  name     = "${random_id.default.hex}-terraform-remote-backend"
  location = var.region

  force_destroy               = false
  public_access_prevention    = "enforced"
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

resource "local_file" "default" {
  file_permission = "0644"
  filename        = "${path.module}/backend.tf"

  content = <<-EOT
  terraform {
    backend "gcs" {
      bucket = "${google_storage_bucket.backend.name}"
    }
  }
  EOT
}
