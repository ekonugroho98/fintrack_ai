import logging
import sys
from datetime import datetime
from typing import Any, Dict, Optional

class CustomFormatter(logging.Formatter):
    """Custom formatter with colors and better error handling"""
    
    grey = "\x1b[38;21m"
    blue = "\x1b[38;5;39m"
    yellow = "\x1b[38;5;226m"
    red = "\x1b[38;5;196m"
    bold_red = "\x1b[31;1m"
    reset = "\x1b[0m"

    def __init__(self, fmt: str):
        super().__init__()
        self.fmt = fmt
        self.FORMATS = {
            logging.DEBUG: self.grey + self.fmt + self.reset,
            logging.INFO: self.blue + self.fmt + self.reset,
            logging.WARNING: self.yellow + self.fmt + self.reset,
            logging.ERROR: self.red + self.fmt + self.reset,
            logging.CRITICAL: self.bold_red + self.fmt + self.reset
        }

    def format(self, record: logging.LogRecord) -> str:
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)

def setup_logger(name: str = "ai-service") -> logging.Logger:
    """Setup logger with custom formatting and handlers"""
    
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)

    # Create formatter
    fmt = "%(asctime)s | %(levelname)-8s | %(message)s"
    formatter = CustomFormatter(fmt)
    console_handler.setFormatter(formatter)

    # Add handler to logger
    logger.addHandler(console_handler)

    return logger

def log_error(logger: logging.Logger, error: Exception, context: Optional[Dict[str, Any]] = None) -> None:
    """Log error with context and stack trace"""
    
    error_context = {
        "error_type": type(error).__name__,
        "error_message": str(error),
        "timestamp": datetime.now().isoformat(),
        **(context or {})
    }

    if hasattr(error, "status_code"):
        error_context["status_code"] = error.status_code

    if hasattr(error, "response"):
        try:
            error_context["response"] = error.response.json()
        except:
            error_context["response"] = str(error.response)

    logger.error(
        f"Error occurred: {error_context['error_type']} - {error_context['error_message']}",
        extra={"error_context": error_context}
    )

# Create default logger instance
logger = setup_logger() 