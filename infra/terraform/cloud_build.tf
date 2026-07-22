resource "google_cloudbuildv2_connection" "github_connection" {
  project  = var.project_id
  location = var.region
  name     = "github-connection"

  github_config {
    app_installation_id = var.github_installation_id

    authorizer_credential {
      oauth_token_secret_version = google_secret_manager_secret_version.github_token_secret_version.id
    }
  }

  depends_on = [google_project_service.cloud_build_api, google_secret_manager_secret_iam_policy.policy]
}

resource "google_cloudbuildv2_repository" "default" {
  project           = var.project_id
  location          = var.region
  name              = var.github_repository_name
  parent_connection = google_cloudbuildv2_connection.github_connection.name
  remote_uri        = "https://github.com/${var.github_repository_owner}/${var.github_repository_name}.git"
}

resource "google_cloudbuild_trigger" "repo_trigger" {
  project         = var.project_id
  location        = var.region
  name            = "repo-trigger"
  service_account = "projects/${var.project_id}/serviceAccounts/${google_service_account.program_builder.email}"

  repository_event_config {
    repository = google_cloudbuildv2_repository.default.id

    push {
      branch = "^main$"
    }
  }

  filename = "cloudbuild.yaml"
}
