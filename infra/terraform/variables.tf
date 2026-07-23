variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
  default     = "ropecon-game-finder"
}

variable "region" {
  description = "Google Cloud region"
  type        = string
  default     = "europe-west1"
}

variable "github_pat" {
  description = "GitHub Personal Access Token"
  type        = string
  sensitive   = true
}

variable "github_installation_id" {
  description = "GitHub App Installation ID"
  type        = number
}

variable "github_repository_name" {
  description = "GitHub repository name"
  type        = string
  default     = "ropecon-game-finder"
}

variable "github_repository_owner" {
  description = "GitHub repository owner"
  type        = string
  default     = "jonaskay"
}

variable "program_object" {
  description = "Name of the program object in the storage bucket"
  type        = string
  default     = "program.json"
}

variable "konsti_url" {
  description = "URL for fetching program items from Konsti API"
  type        = string
  default     = "https://ropekonsti.fi/api/program-items"
}

variable "kompassi_url" {
  description = "URL for the Kompassi GraphQL API"
  type        = string
  default     = "https://kompassi.eu/graphql"
}

variable "kompassi_event_slug" {
  description = "Kompassi event slug whose public schedule is published"
  type        = string
  default     = "ropecon2026"
}

variable "kompassi_locale" {
  description = "Locale used for translated Kompassi schedule fields"
  type        = string
  default     = "en"
}
