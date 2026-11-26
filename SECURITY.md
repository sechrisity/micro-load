# Security Policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Report a vulnerability** button on the repository's Security tab. Do not open a public issue.

Include the affected version, a description of the issue and steps to reproduce. You should get a reply within 7 days.

## Deployment guidance

- Set `REPLEDGER_PASSWORD` whenever the app is reachable from anything other than your own trusted network.
- Serve it over HTTPS through a reverse proxy or a private network. Never expose port 8766 directly to the internet.
- Backups and `state.json` contain personal training and health data. Store them accordingly.
