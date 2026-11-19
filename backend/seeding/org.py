"""Staff users, roles, profiles and dealer branches."""

from __future__ import annotations

from datetime import date

from django.contrib.auth import get_user_model

from accounts.models import Role, UserProfile

from .helpers import (
    CENTRAL_DEALER,
    DEFAULT_PASSWORD,
    DEALER_NAMES,
    NORTH_DEALER,
    WEST_DEALER,
    email,
    log,
    phone,
)

User = get_user_model()

USER_SPECS = (
    {
        "username": "admin",
        "password": "admin123",
        "first_name": "Template",
        "last_name": "Admin",
        "email": "admin@evos.example.com",
        "roles": ("Super Admin",),
        "designation": "System Administrator",
        "department": "Administration",
        "superuser": True,
    },
    {
        "username": "template",
        "password": "evtemplate",
        "first_name": "Template",
        "last_name": "Admin",
        "email": "template@ev.com",
        "roles": ("Super Admin", "Central Operations Admin"),
        "designation": "Operations Director",
        "department": "Administration",
        "superuser": True,
    },
    {
        "username": "ops.manager",
        "password": "manager123",
        "first_name": "Aarav",
        "last_name": "Sharma",
        "email": email("aarav.sharma"),
        "roles": ("Manager", "Central Operations Admin"),
        "designation": "General Manager",
        "department": "Operations",
        "dealer": CENTRAL_DEALER,
    },
    {
        "username": "sales.manager",
        "password": "sales123",
        "first_name": "Priya",
        "last_name": "Shrestha",
        "email": email("priya.shrestha"),
        "roles": ("Sales Manager",),
        "designation": "Sales Manager",
        "department": "Sales",
        "dealer": CENTRAL_DEALER,
    },
    {
        "username": "sales.exec",
        "password": "sales123",
        "first_name": "Rohan",
        "last_name": "Gurung",
        "email": email("rohan.gurung"),
        "roles": ("Sales Executive",),
        "designation": "Sales Executive",
        "department": "Sales",
        "dealer": CENTRAL_DEALER,
    },
    {
        "username": "service.manager",
        "password": "service123",
        "first_name": "Suman",
        "last_name": "Thapa",
        "email": email("suman.thapa"),
        "roles": ("Service Manager",),
        "designation": "Service Manager",
        "department": "Service",
        "dealer": NORTH_DEALER,
    },
    {
        "username": "technician",
        "password": "tech123",
        "first_name": "Manoj",
        "last_name": "Yadav",
        "email": email("manoj.yadav"),
        "roles": ("Technician",),
        "designation": "EV Technician",
        "department": "Service",
        "dealer": WEST_DEALER,
    },
    {
        "username": "hr.admin",
        "password": "hr123",
        "first_name": "Sneha",
        "last_name": "Adhikari",
        "email": email("sneha.adhikari"),
        "roles": ("HR/Admin",),
        "designation": "HR Administrator",
        "department": "Human Resources",
        "dealer": CENTRAL_DEALER,
    },
    {
        "username": "employee",
        "password": "employee123",
        "first_name": "Kiran",
        "last_name": "Rai",
        "email": email("kiran.rai"),
        "roles": ("Employee",),
        "designation": "Inventory Coordinator",
        "department": "Inventory",
        "dealer": WEST_DEALER,
    },
    {
        "username": "dealer.staff",
        "password": "dealer123",
        "first_name": "Nisha",
        "last_name": "Karki",
        "email": email("nisha.karki"),
        "roles": ("Dealer Staff",),
        "designation": "Branch Coordinator",
        "department": "Dealer Operations",
        "dealer": WEST_DEALER,
    },
    {
        "username": "accounts",
        "password": "accounts123",
        "first_name": "Pooja",
        "last_name": "Joshi",
        "email": email("pooja.joshi"),
        "roles": ("Manager",),
        "designation": "Finance & Accounts Officer",
        "department": "Finance",
        "dealer": CENTRAL_DEALER,
    },
)


def ensure_roles() -> dict[str, Role]:
    names = (
        "Super Admin",
        "Central Operations Admin",
        "Manager",
        "Sales Manager",
        "Sales Executive",
        "Service Manager",
        "Technician",
        "HR/Admin",
        "Employee",
        "Dealer Staff",
    )
    result = {}
    for index, name in enumerate(names):
        role, _ = Role.objects.get_or_create(
            name=name,
            defaults={
                "description": f"{name} role for the EV OS demo.",
                "is_protected": name == "Super Admin",
                "is_dealer_role": name == "Dealer Staff",
            },
        )
        result[name] = role
    return result


def seed_organization(dealers: dict) -> dict[str, object]:
    roles = ensure_roles()
    users: dict[str, object] = {}

    for spec in USER_SPECS:
        username = spec["username"]
        user, created = User.objects.update_or_create(
            username=username,
            defaults={
                "email": spec["email"],
                "first_name": spec["first_name"],
                "last_name": spec["last_name"],
                "is_staff": True,
                "is_superuser": spec.get("superuser", False),
                "is_active": True,
            },
        )
        user.set_password(spec["password"])
        user.save()

        dealer = dealers.get(spec.get("dealer")) if spec.get("dealer") else None
        profile, _ = UserProfile.objects.update_or_create(
            user=user,
            defaults={
                "dealer": dealer,
                "phone": phone(len(users) + 10),
                "personal_email": spec["email"],
                "join_date": date(2023, 1, 15),
                "department": spec["department"],
                "designation": spec["designation"],
                "employment_status": "active",
            },
        )
        profile.roles.set([roles[name] for name in spec["roles"] if name in roles])
        users[username] = user
        log(f"  user {username} / {spec['password']} ({'created' if created else 'updated'})")

    # Give every login a role so the dashboard never renders an empty sidebar.
    for username, fallback in (
        ("admin", ("Super Admin",)),
        ("template", ("Super Admin", "Central Operations Admin")),
    ):
        user = users.get(username)
        if not user:
            continue
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.roles.set([roles[name] for name in fallback if name in roles])

    return {
        "users": users,
        "roles": roles,
        "dealers": dealers,
    }
