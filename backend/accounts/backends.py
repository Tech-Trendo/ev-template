from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q


class EmailOrUsernameModelBackend(ModelBackend):
    """
    Authenticate against username or email address (case-insensitive).
    Allows staff and admin users to sign in with either their username or email.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        UserModel = get_user_model()
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        if not username or not password:
            return None

        clean_username = username.strip()
        try:
            user = (
                UserModel.objects.filter(
                    Q(username__iexact=clean_username)
                    | Q(email__iexact=clean_username)
                )
                .order_by("id")
                .first()
            )
            if not user and "@" not in clean_username:
                user = (
                    UserModel.objects.filter(
                        Q(username__istartswith=f"{clean_username}@")
                        | Q(email__istartswith=f"{clean_username}@")
                    )
                    .order_by("id")
                    .first()
                )
        except Exception:
            return None

        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
