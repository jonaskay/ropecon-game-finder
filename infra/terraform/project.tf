data "google_project" "project" {
  project_id = var.project_id
}

resource "google_project_iam_member" "program_builder_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.program_builder.email}"
}

resource "google_project_iam_member" "program_builder_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.program_builder.email}"
}

resource "google_project_iam_member" "program_builder_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.program_builder.email}"
}
