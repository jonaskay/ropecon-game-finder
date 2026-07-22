resource "google_storage_bucket" "program" {
  project       = var.project_id
  location      = var.region
  name          = "${var.project_id}-program"
  force_destroy = true

  cors {
    origin = ["*"]
    method = ["GET", "HEAD"]

    response_header = [
      "Content-Type",
      "ETag",
    ]

    max_age_seconds = 3600
  }
}

resource "google_storage_bucket_iam_member" "program_runner_bucket" {
  bucket = google_storage_bucket.program.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.program_runner.email}"
}
