import logging
import sys
import os
from datetime import datetime

# Ensure logs directory exists
LOG_DIR = "logs"
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

# Generate a unique log file name for this session
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_FILE = os.path.join(LOG_DIR, f"build_session_{timestamp}.log")

class ColorFormatter(logging.Formatter):
    """Adds colors to console logs for easy visibility."""
    grey = "\x1b[38;21m"
    blue = "\x1b[34;21m"
    yellow = "\x1b[33;21m"
    red = "\x1b[31;21m"
    bold_red = "\x1b[31;1m"
    reset = "\x1b[0m"
    format_str = "[%(asctime)s] %(levelname)-8s | %(name)s:%(lineno)d (%(funcName)s) | %(message)s"

    FORMATS = {
        logging.DEBUG: grey + format_str + reset,
        logging.INFO: blue + format_str + reset,
        logging.WARNING: yellow + format_str + reset,
        logging.ERROR: red + format_str + reset,
        logging.CRITICAL: bold_red + format_str + reset
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt, datefmt="%H:%M:%S")
        return formatter.format(record)

def get_logger(name="AppCore"):
    """
    Returns a configured logger that writes to:
    1. Console (with colors and detailed location info)
    2. File (persistent storage for deep debugging)
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)  # Capture everything

    if logger.handlers:
        return logger

    # 1. Console Handler (The "Status Shower")
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG)
    ch.setFormatter(ColorFormatter())
    logger.addHandler(ch)

    # 2. File Handler (The "Permanent Record")
    fh = logging.FileHandler(LOG_FILE)
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)-8s | %(name)s:%(lineno)d (%(funcName)s) | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(fh)

    logger.info(f"--- LOGGING SYSTEM INITIALIZED ---")
    logger.info(f"Log file saved to: {os.path.abspath(LOG_FILE)}")
    return logger

# Initialize the global logger
log = get_logger()
