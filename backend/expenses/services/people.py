import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import serializers

from expenses.models import PeopleInvitation, Person
from expenses.services.email_delivery import send_transactional_email


INVITE_TTL_DAYS = 7


def normalize_email(email):
    return email.strip().lower() if email else email


def create_person(owner, data):
    payload = dict(data)
    payload["email"] = normalize_email(payload.get("email"))
    return Person.objects.create(owner=owner, **payload)


@transaction.atomic
def create_invitation(invited_by, email, relation_type, person=None):
    email = normalize_email(email)
    if invited_by.email and normalize_email(invited_by.email) == email:
        raise serializers.ValidationError("Cannot invite yourself.")

    if person and person.owner_id != invited_by.id:
        raise serializers.ValidationError("You do not have access to this person.")

    if PeopleInvitation.objects.filter(
        invited_by=invited_by,
        email=email,
        status=PeopleInvitation.Status.PENDING,
    ).exists():
        raise serializers.ValidationError("A pending invitation already exists for this email.")

    raw_token = secrets.token_urlsafe(32)
    try:
        invitation = PeopleInvitation.objects.create(
            invited_by=invited_by,
            email=email,
            relation_type=relation_type,
            person=person,
            token_hash=make_password(raw_token),
            expires_at=timezone.now() + timedelta(days=INVITE_TTL_DAYS),
        )
    except IntegrityError as exc:
        raise serializers.ValidationError("A pending invitation already exists for this email.") from exc

    return invitation, raw_token


def send_people_invitation_email(invitation, raw_token):
    base_url = getattr(settings, "FRONTEND_BASE_URL", "soraexpense://")
    invite_link = f"{base_url.rstrip('/')}/invite/people?token={raw_token}"
    subject = "You have been invited to Sora Expense"
    text_body = (
        f"{invitation.invited_by.get_full_name() or invitation.invited_by.email} "
        f"invited you to connect on Sora Expense. Open: {invite_link}"
    )
    html_body = render_to_string(
        "emails/people_invitation.html",
        {
            "invitation": invitation,
            "invite_link": invite_link,
            "ttl_days": INVITE_TTL_DAYS,
        },
    )
    send_transactional_email(
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        to=[invitation.email],
    )


@transaction.atomic
def accept_invitation(raw_token, accepting_user):
    now = timezone.now()
    invitations = PeopleInvitation.objects.select_for_update().filter(
        status=PeopleInvitation.Status.PENDING
    )

    invitation = None
    for candidate in invitations:
        if check_password(raw_token, candidate.token_hash):
            invitation = candidate
            break

    if invitation is None:
        raise serializers.ValidationError("Invalid invitation token.")

    return accept_invitation_record(invitation, accepting_user, now=now)


@transaction.atomic
def accept_invitation_record(invitation, accepting_user, now=None):
    now = now or timezone.now()
    invitation = PeopleInvitation.objects.select_for_update().get(pk=invitation.pk)

    if invitation.status != PeopleInvitation.Status.PENDING:
        raise serializers.ValidationError("Only pending invitations can be accepted.")

    if invitation.expires_at < now:
        invitation.status = PeopleInvitation.Status.EXPIRED
        invitation.save(update_fields=["status", "updated_at"])
        raise serializers.ValidationError("This invitation is expired.")

    if invitation.email != normalize_email(accepting_user.email):
        raise serializers.ValidationError("This invitation was sent to another email.")

    person = invitation.person
    if person is None:
        person = Person.objects.create(
            owner=invitation.invited_by,
            name=accepting_user.get_full_name() or accepting_user.email,
            email=accepting_user.email,
            relation_type=invitation.relation_type,
            linked_user=accepting_user,
        )
        invitation.person = person
    else:
        person.linked_user = accepting_user
        if not person.email:
            person.email = accepting_user.email
        person.save(update_fields=["linked_user", "email", "updated_at"])

    invitation.status = PeopleInvitation.Status.ACCEPTED
    invitation.accepted_at = now
    invitation.save(update_fields=["person", "status", "accepted_at", "updated_at"])
    return invitation


def cancel_invitation(invitation, user):
    if invitation.invited_by_id != user.id:
        raise serializers.ValidationError("You do not have access to this invitation.")
    if invitation.status != PeopleInvitation.Status.PENDING:
        raise serializers.ValidationError("Only pending invitations can be cancelled.")
    invitation.status = PeopleInvitation.Status.CANCELLED
    invitation.save(update_fields=["status", "updated_at"])
    return invitation


def decline_invitation(invitation, user):
    if invitation.email != normalize_email(user.email):
        raise serializers.ValidationError("You do not have access to this invitation.")
    if invitation.status != PeopleInvitation.Status.PENDING:
        raise serializers.ValidationError("Only pending invitations can be declined.")
    invitation.status = PeopleInvitation.Status.CANCELLED
    invitation.save(update_fields=["status", "updated_at"])
    return invitation
