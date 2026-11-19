from drf_spectacular.utils import extend_schema, OpenApiResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

ELECTRIC_COST_PER_KM = 1.8
MAINTENANCE_SAVINGS_FACTOR = 0.35
CO2_PER_LITER_DIESEL = 2.68


def _emi_calculation(loan_amount: float, annual_rate: float, months: int):
    if loan_amount <= 0 or months <= 0:
        return 0.0
    monthly_rate = annual_rate / 12 / 100
    if monthly_rate == 0:
        return loan_amount / months
    pow_factor = (1 + monthly_rate) ** months
    return loan_amount * monthly_rate * pow_factor / (pow_factor - 1)


@extend_schema(
    tags=["calculator"],
    summary="Calculate annual fuel savings (EV vs diesel)",
    description=(
        "Estimates annual fuel cost savings, maintenance savings, total savings "
        "and CO2 reduction when switching from a diesel to an electric vehicle. "
        "All inputs are optional and fall back to the defaults below."
    ),
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "monthly_km": {"type": "number", "example": 6500, "default": 6500},
                "diesel_price": {"type": "number", "example": 195, "default": 195},
                "fuel_consumption": {"type": "number", "example": 20, "default": 20},
            },
        }
    },
    responses={
        200: OpenApiResponse(
            response={
                "type": "object",
                "properties": {
                    "currency": {"type": "string", "example": "NPR"},
                    "inputs": {
                        "type": "object",
                        "properties": {
                            "monthly_km": {"type": "number"},
                            "diesel_price": {"type": "number"},
                            "fuel_consumption": {"type": "number"},
                        },
                    },
                    "results": {
                        "type": "object",
                        "properties": {
                            "fuel_savings_annual": {"type": "integer"},
                            "maintenance_savings_annual": {"type": "integer"},
                            "total_savings_annual": {"type": "integer"},
                            "co2_reduction_tonnes_annual": {"type": "number"},
                        },
                    },
                },
            },
            description="Savings estimate in NPR.",
        ),
        400: OpenApiResponse(response={"type": "object", "properties": {"error": {"type": "string"}}}),
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
def savings_calculator(request):
    try:
        monthly_km = float(request.data.get("monthly_km", 6500))
        diesel_price = float(request.data.get("diesel_price", 195))
        fuel_consumption = float(request.data.get("fuel_consumption", 20))
    except (TypeError, ValueError):
        return Response(
            {"error": "monthly_km, diesel_price and fuel_consumption must be numbers."},
            status=400,
        )

    if monthly_km <= 0 or diesel_price <= 0 or fuel_consumption <= 0:
        return Response(
            {"error": "All inputs must be greater than zero."}, status=400
        )

    annual_km = monthly_km * 12
    annual_liters = (annual_km / 100) * fuel_consumption
    annual_diesel_cost = annual_liters * diesel_price
    annual_electric_cost = annual_km * ELECTRIC_COST_PER_KM
    fuel_savings = annual_diesel_cost - annual_electric_cost
    maintenance_savings = annual_diesel_cost * MAINTENANCE_SAVINGS_FACTOR * 0.5
    co2_reduction_tonnes = (annual_liters * CO2_PER_LITER_DIESEL) / 1000

    return Response(
        {
            "currency": "NPR",
            "inputs": {
                "monthly_km": monthly_km,
                "diesel_price": diesel_price,
                "fuel_consumption": fuel_consumption,
            },
            "results": {
                "fuel_savings_annual": round(fuel_savings),
                "maintenance_savings_annual": round(maintenance_savings),
                "total_savings_annual": round(fuel_savings + maintenance_savings),
                "co2_reduction_tonnes_annual": round(co2_reduction_tonnes, 1),
            },
        }
    )


@extend_schema(
    tags=["calculator"],
    summary="Calculate EMI for vehicle financing",
    description=(
        "Calculates Equated Monthly Installment (EMI), total interest payable and total amount payable "
        "for a vehicle loan on reducing balance. Supports vehicle_price + down_payment_percent or direct loan_amount."
    ),
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "vehicle_price": {"type": "number", "example": 5500000, "default": 5500000},
                "down_payment_percent": {"type": "number", "example": 20, "default": 20},
                "down_payment": {"type": "number", "example": 1100000, "description": "Absolute down payment NPR, overrides percent if provided"},
                "loan_amount": {"type": "number", "example": 4400000, "description": "Direct loan principal, overrides vehicle_price calculation if provided"},
                "interest_rate": {"type": "number", "example": 11, "default": 11, "description": "Annual interest rate % p.a."},
                "tenure_years": {"type": "number", "example": 5, "default": 5},
                "tenure_months": {"type": "number", "example": 60, "description": "Overrides tenure_years if provided"},
            },
        }
    },
    responses={
        200: OpenApiResponse(
            response={
                "type": "object",
                "properties": {
                    "currency": {"type": "string", "example": "NPR"},
                    "inputs": {
                        "type": "object",
                        "properties": {
                            "vehicle_price": {"type": "number"},
                            "down_payment_percent": {"type": "number"},
                            "down_payment": {"type": "number"},
                            "loan_amount": {"type": "number"},
                            "interest_rate": {"type": "number"},
                            "tenure_months": {"type": "number"},
                        },
                    },
                    "results": {
                        "type": "object",
                        "properties": {
                            "emi": {"type": "number", "example": 95000},
                            "total_interest": {"type": "number", "example": 1300000},
                            "total_payable_loan": {"type": "number", "example": 5700000},
                            "total_cost": {"type": "number", "example": 6800000},
                            "loan_amount": {"type": "number", "example": 4400000},
                            "down_payment": {"type": "number", "example": 1100000},
                        },
                    },
                },
            },
            description="EMI estimate in NPR.",
        ),
        400: OpenApiResponse(response={"type": "object", "properties": {"error": {"type": "string"}}}),
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
def emi_calculator(request):
    try:
        vehicle_price = float(request.data.get("vehicle_price", 5500000)) if request.data.get("vehicle_price") is not None or request.data.get("loan_amount") is None else 5500000
        down_payment = request.data.get("down_payment")
        down_payment_percent = float(request.data.get("down_payment_percent", 20)) if request.data.get("down_payment_percent") is not None else 20
        loan_amount_raw = request.data.get("loan_amount")
        interest_rate = float(request.data.get("interest_rate", 11))
        tenure_months_raw = request.data.get("tenure_months")
        tenure_years = float(request.data.get("tenure_years", 5)) if tenure_months_raw is None else None

        if loan_amount_raw is not None:
            loan_amount = float(loan_amount_raw)
            # derive down_payment if not provided
            if down_payment is not None:
                down_payment_val = float(down_payment)
            else:
                down_payment_val = max(0, vehicle_price - loan_amount) if request.data.get("vehicle_price") is not None else 0
        else:
            if down_payment is not None:
                down_payment_val = float(down_payment)
            else:
                down_payment_val = vehicle_price * down_payment_percent / 100
            loan_amount = vehicle_price - down_payment_val

        if tenure_months_raw is not None:
            tenure_months = int(float(tenure_months_raw))
        else:
            tenure_months = int(tenure_years * 12)  # type: ignore

    except (TypeError, ValueError):
        return Response(
            {"error": "vehicle_price, down_payment, loan_amount, interest_rate, tenure_years/tenure_months must be numbers."},
            status=400,
        )

    if loan_amount <= 0:
        return Response({"error": "loan_amount must be greater than zero. Check vehicle_price and down_payment."}, status=400)
    if interest_rate < 0 or interest_rate > 100:
        return Response({"error": "interest_rate must be between 0 and 100."}, status=400)
    if tenure_months <= 0 or tenure_months > 600:
        return Response({"error": "tenure must be between 1 and 600 months."}, status=400)

    emi = _emi_calculation(loan_amount, interest_rate, tenure_months)
    total_payable_loan = emi * tenure_months
    total_interest = total_payable_loan - loan_amount
    # total_cost includes down payment if we can determine it
    if loan_amount_raw is not None and request.data.get("vehicle_price") is None and down_payment is None:
        # No vehicle context, total_cost = total_payable_loan
        total_cost = total_payable_loan
        down_payment_val = 0
        vehicle_price = loan_amount
    else:
        total_cost = down_payment_val + total_payable_loan
        # if vehicle_price not provided but we have loan + down, derive it
        if request.data.get("vehicle_price") is None and loan_amount_raw is None:
            vehicle_price = loan_amount + down_payment_val

    return Response(
        {
            "currency": "NPR",
            "inputs": {
                "vehicle_price": round(vehicle_price),
                "down_payment_percent": round(down_payment_percent, 2) if loan_amount_raw is None and request.data.get("down_payment") is None else None,
                "down_payment": round(down_payment_val),
                "loan_amount": round(loan_amount),
                "interest_rate": interest_rate,
                "tenure_months": tenure_months,
                "tenure_years": round(tenure_months / 12, 2),
            },
            "results": {
                "emi": round(emi),
                "emi_precise": round(emi, 2),
                "total_interest": round(total_interest),
                "total_payable_loan": round(total_payable_loan),
                "total_cost": round(total_cost),
                "loan_amount": round(loan_amount),
                "down_payment": round(down_payment_val),
            },
        }
    )
