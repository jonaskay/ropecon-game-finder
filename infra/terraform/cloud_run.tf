resource "google_cloud_run_v2_job" "program_job" {
  project             = var.project_id
  location            = var.region
  name                = "program-job"
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.program_runner.email

      containers {
        image = "${google_artifact_registry_repository.default.registry_uri}/program-image"

        env {
          name  = "PROGRAM_BUCKET"
          value = google_storage_bucket.program.name
        }

        env {
          name  = "PROGRAM_OBJECT"
          value = var.program_object
        }

        env {
          name  = "KONSTI_URL"
          value = var.konsti_url
        }

        env {
          name  = "KOMPASSI_URL"
          value = var.kompassi_url
        }

        env {
          name  = "KOMPASSI_EVENT_SLUG"
          value = var.kompassi_event_slug
        }

        env {
          name  = "KOMPASSI_LOCALE"
          value = var.kompassi_locale
        }
      }
    }
  }

  depends_on = [google_project_service.cloud_run_api]
}

resource "google_cloud_run_v2_job_iam_member" "program_scheduler_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_job.program_job.location
  name     = google_cloud_run_v2_job.program_job.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.program_scheduler.email}"
}
