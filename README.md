Use nodejs user to avoid permission issues `su nodejs`

create ssh key if none exist: `ssh-keygen -t ed25519 -C "name@email.com"`
Clone repo
run `npm install`
fill .env values properly
run `pm2 start npm --name "ETA" -- run "prod" --no-automation`
run `pm2 delete hello` to remove default pm2 app

### Update Nginx Configuration

exit from nodejs user

`sudo nano /etc/nginx/sites-available/default`

Find the existing server_name line and replace with domain name
Find the existing location line and replace with correct port

Reload nginx so certbot finds the name: `sudo systemctl reload nginx`

app should now be running on HTTP

install certbot `sudo snap install --classic certbot`

`sudo certbot --nginx --email name@email.com --agree-tos`

### TO UPDATE

ssh into server
`su nodejs`
`cd ~/{folder where repo is}/`
`git pull`
`pm2 restart ETA`
