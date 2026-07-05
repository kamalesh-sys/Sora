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


def seed_default_categories(user):
    categories = []

    for preset in DEFAULT_EXPENSE_CATEGORIES:
        category, created = user.expense_categories.get_or_create(
            name=preset["name"],
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
