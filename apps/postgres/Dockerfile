# PostgreSQL for Umami analytics (local dev). Production uses Render Managed PostgreSQL — see README.
FROM postgres:17-alpine

ENV POSTGRES_USER=umami
ENV POSTGRES_PASSWORD=umami
ENV POSTGRES_DB=umami

EXPOSE 5432

VOLUME ["/var/lib/postgresql/data"]
