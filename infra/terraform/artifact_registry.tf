resource "google_artifact_registry_repository" "default" {
  project       = var.project_id
  location      = var.region
  repository_id = "${var.project_id}-repo"
  format        = "DOCKER"
}
