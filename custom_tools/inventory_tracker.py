import logging
import sys
from datetime import datetime

# Configure a robust, full-detail logger
def setup_logger(name="CustomToolLogger"):
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)  # Capture everything

    # Clear existing handlers to avoid duplicates if reloaded
    if logger.handlers:
        logger.handlers.clear()

    # Create console handler with detailed format
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)

    # Create formatter with timestamp, level, function, line number, and message
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)s | %(funcName)s:%(lineno)d | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    return logger

# Initialize the global logger
logger = setup_logger()

class InventoryTracker:
    def __init__(self):
        self.inventory = {}
        logger.info("InventoryTracker initialized successfully.")

    def add_item(self, item_id, name, quantity, price):
        logger.debug(f"Attempting to add item: ID={item_id}, Name={name}, Qty={quantity}, Price={price}")
        
        if not isinstance(quantity, (int, float)) or quantity < 0:
            logger.error(f"Invalid quantity for item {item_id}: {quantity}. Must be non-negative number.")
            raise ValueError("Quantity must be a non-negative number.")
        
        if not isinstance(price, (int, float)) or price < 0:
            logger.error(f"Invalid price for item {item_id}: {price}. Must be non-negative number.")
            raise ValueError("Price must be a non-negative number.")

        if item_id in self.inventory:
            logger.warning(f"Item {item_id} already exists. Updating existing entry.")
            old_qty = self.inventory[item_id]['quantity']
            self.inventory[item_id]['quantity'] += quantity
            logger.info(f"Updated item {item_id}. Old Qty: {old_qty}, New Qty: {self.inventory[item_id]['quantity']}")
        else:
            self.inventory[item_id] = {
                'name': name,
                'quantity': quantity,
                'price': price,
                'last_updated': datetime.now().isoformat()
            }
            logger.info(f"New item added: {item_id} ({name})")

    def get_total_value(self):
        logger.debug("Calculating total inventory value.")
        total = 0.0
        try:
            for item_id, data in self.inventory.items():
                item_value = data['quantity'] * data['price']
                total += item_value
                logger.debug(f"Item {item_id}: {data['quantity']} * {data['price']} = {item_value}")
            logger.info(f"Total inventory value calculated: ${total:.2f}")
            return total
        except Exception as e:
            logger.critical(f"Error calculating total value: {e}", exc_info=True)
            raise

    def remove_item(self, item_id, quantity):
        logger.debug(f"Attempting to remove {quantity} of item {item_id}.")
        if item_id not in self.inventory:
            logger.error(f"Item {item_id} not found in inventory.")
            raise KeyError(f"Item {item_id} does not exist.")
        
        current_qty = self.inventory[item_id]['quantity']
        if quantity > current_qty:
            logger.error(f"Cannot remove {quantity}. Only {current_qty} available for item {item_id}.")
            raise ValueError("Insufficient stock.")
        
        self.inventory[item_id]['quantity'] -= quantity
        self.inventory[item_id]['last_updated'] = datetime.now().isoformat()
        
        if self.inventory[item_id]['quantity'] == 0:
            del self.inventory[item_id]
            logger.info(f"Item {item_id} removed completely from inventory.")
        else:
            logger.info(f"Removed {quantity} of item {item_id}. Remaining: {self.inventory[item_id]['quantity']}")

if __name__ == "__main__":
    logger.info("--- Starting Real Inventory Tool ---")
    
    tracker = InventoryTracker()
    
    try:
        # Real dynamic operations
        tracker.add_item("A001", "Laptop", 5, 1200.50)
        tracker.add_item("A002", "Mouse", 20, 25.00)
        tracker.add_item("A001", "Laptop", 2, 1200.50)  # Update existing
        
        total_val = tracker.get_total_value()
        print(f"\nCurrent Total Value: ${total_val:.2f}\n")
        
        tracker.remove_item("A002", 5)
        
        # Trigger a deliberate error to show log power
        # tracker.remove_item("A002", 1000) 
        
    except Exception as e:
        logger.critical("An unhandled error occurred in the main execution flow.", exc_info=True)
    
    logger.info("--- Execution Finished ---")
