# Monthly service-fee timer

After deploying the backend and running `npm run migrate`, install and enable the timer as `root`:

```bash
install -o root -g root -m 644 \
  /var/www/pondokpay/deploy/systemd/pondokpay-service-fee.service \
  /etc/systemd/system/pondokpay-service-fee.service
install -o root -g root -m 644 \
  /var/www/pondokpay/deploy/systemd/pondokpay-service-fee.timer \
  /etc/systemd/system/pondokpay-service-fee.timer
systemctl daemon-reload
systemctl enable --now pondokpay-service-fee.timer
systemctl list-timers pondokpay-service-fee.timer --no-pager
```

The timer runs on the first day of each month at 00:15 Asia/Jakarta. The job is safe to rerun for the same month: it creates at most one charge per active student and billing period. `Persistent=true` makes systemd run a missed calendar event after the VPS returns.

Set the monthly rate under **Kas admin**. A new or changed amount applies on the first day of the next month. The monthly job performs real balance deductions, so do not run it manually on production just to test it. Verify actual deductions and the timer on staging before go-live.

Inspect timer and job outcomes with:

```bash
systemctl status pondokpay-service-fee.timer --no-pager
journalctl -u pondokpay-service-fee.service -n 100 --no-pager
```
