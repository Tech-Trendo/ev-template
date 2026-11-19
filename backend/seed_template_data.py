"""Complete demo data seeder for the EV OS EV admin console.

The heavy lifting lives in the :mod:`seeding` package so each module can be
maintained independently.  Running this script is safe and idempotent:

    python seed_template_data.py

It creates staff logins, dealers, EV catalogue pages, import shipments, stock
units, sales, PDI/VEI inspections, condition reports, CRM leads/customers,
pipeline records, quotations, documents, service orders, events, HRM,
attendance, CMS pages, stories, notifications and audit history.

Demo logins (all passwords are re-applied on every run):

    admin      / admin123
    template   / evtemplate
    sales.manager / sales123
    service.manager / service123
    hr.admin   / hr123
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from seeding import run_seed  # noqa: E402


if __name__ == "__main__":
    run_seed()
