
from fastapi.testclient import TestClient

from app.core.config import settings


def create_workspace(client: TestClient, headers: dict) -> dict:
    data = {"name": "Task Workspace", "description": "Description"}
    response = client.post(f"{settings.API_V1_STR}/workspaces/", headers=headers, json=data)
    assert response.status_code == 200
    return response.json()

def create_project(client: TestClient, headers: dict, workspace_id: str) -> dict:
    data = {"name": "Task Project", "workspace_id": workspace_id}
    response = client.post(f"{settings.API_V1_STR}/projects/", headers=headers, json=data)
    assert response.status_code == 200
    return response.json()

def test_create_task(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    ws = create_workspace(client, superuser_token_headers)
    proj = create_project(client, superuser_token_headers, ws["id"])

    data = {
        "title": "Test Task",
        "project_id": proj["id"],
        "status": "todo",
        "priority": "medium"
    }
    response = client.post(
        f"{settings.API_V1_STR}/tasks/", headers=superuser_token_headers, json=data
    )
    assert response.status_code == 200
    content = response.json()
    assert content["title"] == data["title"]
    assert content["project_id"] == proj["id"]
    assert content["status"] == "todo"

def test_read_tasks(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    ws = create_workspace(client, superuser_token_headers)
    proj = create_project(client, superuser_token_headers, ws["id"])

    # Create Task
    client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=superuser_token_headers,
        json={"title": "Read Task", "project_id": proj["id"]}
    )

    response = client.get(
        f"{settings.API_V1_STR}/tasks/?projectId={proj['id']}",
        headers=superuser_token_headers
    )
    assert response.status_code == 200
    content = response.json()
    assert len(content["data"]) >= 1

def test_update_task_status(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    ws = create_workspace(client, superuser_token_headers)
    proj = create_project(client, superuser_token_headers, ws["id"])

    task = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=superuser_token_headers,
        json={"title": "Status Task", "project_id": proj["id"], "status": "todo"}
    ).json()

    # Mark as Done
    response = client.put(
        f"{settings.API_V1_STR}/tasks/{task['id']}",
        headers=superuser_token_headers,
        json={"status": "done"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "done"

def test_delete_task(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    ws = create_workspace(client, superuser_token_headers)
    proj = create_project(client, superuser_token_headers, ws["id"])

    task = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=superuser_token_headers,
        json={"title": "Delete Task", "project_id": proj["id"]}
    ).json()

    response = client.delete(
        f"{settings.API_V1_STR}/tasks/{task['id']}",
        headers=superuser_token_headers
    )
    assert response.status_code == 200

    # Verify 404
    response = client.get(
        f"{settings.API_V1_STR}/tasks/{task['id']}",
        headers=superuser_token_headers
    )
    assert response.status_code == 404
