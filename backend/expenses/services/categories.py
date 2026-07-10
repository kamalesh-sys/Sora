from expenses.models import ExpenseCategory


DEFAULT_EXPENSE_CATEGORIES = [
    {"name": "Groceries", "icon": "cart-outline", "color": "#62c690"},
    {"name": "Utilities", "icon": "lightning-bolt", "color": "#7199ff"},
    {"name": "Food & Dining", "icon": "silverware-fork-knife", "color": "#7ed3bd"},
    {"name": "Transport", "icon": "car", "color": "#f4ae3d"},
    {"name": "Shopping", "icon": "shopping-outline", "color": "#d86ab8"},
    {"name": "Health", "icon": "heart-pulse", "color": "#f45f5f"},
    {"name": "Rent & Home", "icon": "home-city-outline", "color": "#8b72ff"},
    {"name": "Entertainment", "icon": "movie-open-play-outline", "color": "#9b72ff"},
    {"name": "Fuel", "icon": "gas-station-outline", "color": "#fb8c42"},
    {"name": "Others", "icon": "dots-horizontal", "color": "#a6adba"},
]

DEFAULT_INCOME_CATEGORIES = [
    {"name": "Salary", "icon": "briefcase-outline", "color": "#2E7D5B"},
    {"name": "Business", "icon": "storefront-outline", "color": "#3478F6"},
    {"name": "Freelance", "icon": "laptop", "color": "#6558D3"},
    {"name": "Interest", "icon": "bank-outline", "color": "#A36A00"},
    {"name": "Refund", "icon": "cash-refund", "color": "#168A72"},
    {"name": "Gift", "icon": "gift-outline", "color": "#B43A70"},
    {"name": "Other income", "icon": "plus-circle-outline", "color": "#667085"},
]


def seed_default_categories(user, transaction_type=ExpenseCategory.TransactionType.EXPENSE):
    categories = []

    if transaction_type not in ExpenseCategory.TransactionType.values:
        raise ValueError("Invalid transaction type.")

    presets = []
    if transaction_type == ExpenseCategory.TransactionType.EXPENSE:
        presets.extend(
            (ExpenseCategory.TransactionType.EXPENSE, preset)
            for preset in DEFAULT_EXPENSE_CATEGORIES
        )
    if transaction_type == ExpenseCategory.TransactionType.INCOME:
        presets.extend(
            (ExpenseCategory.TransactionType.INCOME, preset)
            for preset in DEFAULT_INCOME_CATEGORIES
        )

    for category_type, preset in presets:
        category, created = user.expense_categories.get_or_create(
            name=preset["name"],
            transaction_type=category_type,
            defaults={
                "icon": preset["icon"],
                "color": preset["color"],
            },
        )

        updates = []
        if not category.icon:
            category.icon = preset["icon"]
            updates.append("icon")
        if not category.color:
            category.color = preset["color"]
            updates.append("color")
        if not created and updates:
            category.save(update_fields=updates)

        categories.append(category)

    return categories
