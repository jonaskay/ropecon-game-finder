resource "google_cloud_scheduler_job" "program_scheduler_job" {
  project          = data.google_project.project.project_id
  region           = var.region
  name             = "program-job"
  description      = "Keep program data up-to-date"
  schedule         = "*/15 * * * *"
  attempt_deadline = "320s"

  retry_config {
    retry_count = 3
  }

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${data.google_project.project.project_id}/locations/${google_cloud_run_v2_job.program_job.location}/jobs/${google_cloud_run_v2_job.program_job.name}:run"
    body        = base64encode("{}")

    headers = {
      "Content-Type" = "application/json"
    }

    oauth_token {
      service_account_email = google_service_account.program_scheduler.email
    }
  }

  depends_on = [google_project_service.cloud_scheduler_api]
}
