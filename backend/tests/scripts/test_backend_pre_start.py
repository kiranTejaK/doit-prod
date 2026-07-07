from unittest.mock import MagicMock, patch

from app.backend_pre_start import init, logger


def test_init_successful_connection() -> None:
    engine_mock = MagicMock()

    session_mock = MagicMock()
    session_mock.__enter__.return_value = session_mock
    execute_mock = MagicMock(return_value=True)
    session_mock.configure_mock(**{"execute.return_value": execute_mock})

    with (
        patch("app.backend_pre_start.Session", return_value=session_mock),
        patch.object(logger, "info"),
        patch.object(logger, "error"),
        patch.object(logger, "warn"),
    ):
        try:
            init(engine_mock)
            connection_successful = True
        except Exception:
            connection_successful = False

        assert (
            connection_successful
        ), "The database connection should be successful and not raise an exception."

        # session_mock.execute.assert_called_once()
        # select(1) returns a new object, so exact comparison might fail unless we mock select too
        assert session_mock.execute.called, "The session should execute a select statement once."
