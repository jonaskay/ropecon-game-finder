resource "google_service_account" "program_runner" {
  project      = var.project_id
  account_id   = "program-runner"
  display_name = "Program Runner Service Account"

  depends_on = [google_project_service.iam_api]
}

resource "google_service_account" "program_scheduler" {
  project      = var.project_id
  account_id   = "program-scheduler"
  display_name = "Program Scheduler Service Account"

  depends_on = [google_project_service.iam_api]
}

resource "google_service_account" "program_builder" {
  project      = var.project_id
  account_id   = "program-builder"
  display_name = "Program Builder Service Account"

  depends_on = [google_project_service.iam_api]
}

resource "google_service_account_iam_member" "program_builder_act_as_program_runner" {
  service_account_id = google_service_account.program_runner.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.program_builder.email}"
}
