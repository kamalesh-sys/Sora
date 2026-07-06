from django.db import migrations


RLS_TABLES = [
    "django_migrations",
    "django_content_type",
    "auth_permission",
    "auth_group",
    "auth_group_permissions",
    "auth_user_groups",
    "auth_user_user_permissions",
    "django_admin_log",
    "auth_user",
    "django_session",
    "authtoken_token",
    "expenses_signupotp",
    "expenses_expensecategory",
    "expenses_person",
    "expenses_peopleinvitation",
    "expenses_household",
    "expenses_householdmember",
    "expenses_expense",
    "expenses_expenseshare",
    "expenses_monthlybudget",
    "expenses_categorybudget",
    "expenses_recurringbill",
    "expenses_billoccurrence",
    "expenses_settlement",
]


def _deny_all_policy_sql():
    statements = []
    for table_name in RLS_TABLES:
        statements.append(
            f"""
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '{table_name}'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = '{table_name}'
          AND policyname = 'deny_supabase_api_access'
    ) THEN
        EXECUTE 'CREATE POLICY "deny_supabase_api_access" ON public."{table_name}" FOR ALL TO public USING (false) WITH CHECK (false)';
    END IF;
END $$;
""".strip()
        )
    return "\n".join(statements)


class Migration(migrations.Migration):
    dependencies = [
        ("expenses", "0007_enable_rls_on_supabase_public_tables"),
    ]

    operations = [
        migrations.RunSQL(
            sql=_deny_all_policy_sql(),
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
