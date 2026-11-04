use reqwest::Client;
use super::types::*;

#[derive(Clone)]
pub struct GitLabClient {
    client: Client,
    base_url: String,
    token: String,
}

impl GitLabClient {
    pub fn new(base_url: &str, token: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            token: token.to_string(),
        }
    }

    #[allow(dead_code)]
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Test connection by fetching current user info
    pub async fn test_connection(&self) -> Result<GitLabUser, String> {
        let url = format!("{}/api/v4/user", self.base_url);
        self.client
            .get(&url)
            .header("PRIVATE-TOKEN", &self.token)
            .send()
            .await
            .map_err(|e| format!("Connection failed: {}", e))?
            .json::<GitLabUser>()
            .await
            .map_err(|e| format!("Failed to parse user: {}", e))
    }

    /// Search projects by name
    pub async fn search_projects(&self, query: &str) -> Result<Vec<Project>, String> {
        let url = format!("{}/api/v4/projects", self.base_url);
        self.client
            .get(&url)
            .header("PRIVATE-TOKEN", &self.token)
            .query(&[
                ("search", query),
                ("membership", "true"),
                ("per_page", "20"),
                ("order_by", "last_activity_at"),
            ])
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Parse failed: {}", e))
    }

    /// Get open issues for a project
    pub async fn get_issues(
        &self,
        project_id: u64,
        state: Option<&str>,
        assignee: Option<&str>,
        labels: Option<&str>,
    ) -> Result<Vec<Issue>, String> {
        let url = format!("{}/api/v4/projects/{}/issues", self.base_url, project_id);
        let mut req = self.client
            .get(&url)
            .header("PRIVATE-TOKEN", &self.token)
            .query(&[("per_page", "20"), ("order_by", "updated_at"), ("sort", "desc")]);

        if let Some(s) = state {
            req = req.query(&[("state", s)]);
        }
        if let Some(a) = assignee {
            req = req.query(&[("assignee_username", a)]);
        }
        if let Some(l) = labels {
            req = req.query(&[("labels", l)]);
        }

        req.send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Parse failed: {}", e))
    }

    /// Get merge requests for a project
    pub async fn get_merge_requests(
        &self,
        project_id: u64,
        state: Option<&str>,
        reviewer: Option<&str>,
    ) -> Result<Vec<MergeRequest>, String> {
        let url = format!(
            "{}/api/v4/projects/{}/merge_requests",
            self.base_url, project_id
        );
        let mut req = self.client
            .get(&url)
            .header("PRIVATE-TOKEN", &self.token)
            .query(&[("per_page", "20"), ("order_by", "updated_at"), ("sort", "desc")]);

        if let Some(s) = state {
            req = req.query(&[("state", s)]);
        }
        if let Some(r) = reviewer {
            req = req.query(&[("reviewer_username", r)]);
        }

        req.send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Parse failed: {}", e))
    }

    /// Get current user's todos
    pub async fn get_todos(&self, project_id: Option<u64>) -> Result<Vec<Todo>, String> {
        let url = format!("{}/api/v4/todos", self.base_url);
        let mut req = self.client
            .get(&url)
            .header("PRIVATE-TOKEN", &self.token)
            .query(&[("state", "pending"), ("per_page", "20")]);

        if let Some(pid) = project_id {
            req = req.query(&[("project_id", &pid.to_string())]);
        }

        req.send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Parse failed: {}", e))
    }

    /// Add a comment to an issue or MR
    pub async fn add_note(
        &self,
        project_id: u64,
        target_type: &str, // "issues" or "merge_requests"
        target_iid: u64,
        body: &str,
    ) -> Result<NoteComment, String> {
        let url = format!(
            "{}/api/v4/projects/{}/{}/{}/notes",
            self.base_url, project_id, target_type, target_iid
        );
        self.client
            .post(&url)
            .header("PRIVATE-TOKEN", &self.token)
            .json(&serde_json::json!({ "body": body }))
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Parse failed: {}", e))
    }
}
