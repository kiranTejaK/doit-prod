
from fastapi.testclient import TestClient

from app.core.config import settings


def create_workspace(client: TestClient, headers: dict) -> dict:
    data = {"name": "Test Workspace", "description": "Description"}
    response = client.post(f"{settings.API_V1_STR}/workspaces/", headers=headers, json=data)
    assert response.status_code == 200
    return response.json()

def test_create_project(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Workspace
    workspace = create_workspace(client, superuser_token_headers)
    workspace_id = workspace["id"]

    # 2. Create Project
    data = {
        "name": "Test Project",
        "workspace_id": workspace_id,
        "description": "Test Description",
        "color": "#ff0000",
        "is_private": False
    }
    response = client.post(
        f"{settings.API_V1_STR}/projects/", headers=superuser_token_headers, json=data
    )
    assert response.status_code == 200
    content = response.json()
    assert content["name"] == data["name"]
    assert content["workspace_id"] == workspace_id
    assert "id" in content
    assert content["owner_id"] is not None

def test_read_projects(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Workspace & Project
    workspace = create_workspace(client, superuser_token_headers)

    data = {
        "name": "Read Project",
        "workspace_id": workspace["id"],
        "is_private": False
    }
    client.post(
        f"{settings.API_V1_STR}/projects/", headers=superuser_token_headers, json=data
    )

    # 2. Read Projects
    response = client.get(
        f"{settings.API_V1_STR}/projects/", headers=superuser_token_headers
    )
    assert response.status_code == 200
    content = response.json()
    assert len(content["data"]) >= 1
    assert "workspace_name" in content["data"][0]

def test_update_project(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    workspace = create_workspace(client, superuser_token_headers)
    data = {
        "name": "Update Project",
        "workspace_id": workspace["id"]
    }
    project = client.post(
        f"{settings.API_V1_STR}/projects/", headers=superuser_token_headers, json=data
    ).json()

    update_data = {"name": "Updated Name"}
    response = client.put(
        f"{settings.API_V1_STR}/projects/{project['id']}",
        headers=superuser_token_headers,
        json=update_data
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"

def test_delete_project(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    workspace = create_workspace(client, superuser_token_headers)
    data = {
        "name": "Delete Project",
        "workspace_id": workspace["id"]
    }
    project = client.post(
        f"{settings.API_V1_STR}/projects/", headers=superuser_token_headers, json=data
    ).json()

    response = client.delete(
        f"{settings.API_V1_STR}/projects/{project['id']}",
        headers=superuser_token_headers
    )
    assert response.status_code == 200

    # Verify 404
    response = client.get(
        f"{settings.API_V1_STR}/projects/{project['id']}",
        headers=superuser_token_headers
    )
    assert response.status_code == 404
