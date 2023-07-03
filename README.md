If using Digital Ocean, use a NodeJS droplet. It already comes with things setup


Use nodejs user to avoid permission issues `su nodejs`

create ssh key if none exist: `ssh-keygen -t ed25519 -C "name@email.com"` and put it as deploy key

### TO USE CI WITH GITHUB ACTIONS START WITH THIS FIRST

`su nodejs`
Go to `~`
Create a self hosted runner on Github
https://github.com/Grim-Syndicate/eta-backend/settings/actions/runners/new?arch=x64&os=linux

On the Configure steps, using all the defaults is fine

Instead of running it, exit su to root and install the service
`./svc.sh install`
`./svc.sh start`

Go back to `su nodejs`

Clone repo to wherever the runner's work directory got created. If defaults, it should be here: `~/actions-runner/_work/eta-backend` (it will clone into another `eta-backend` dir)
run `npm install`
fill .env values properly
run `pm2 start npm --name "ETA" -- run "prod" --no-automation`
run `pm2 delete hello` to remove default pm2 app

Now every time that we push it should auto update the app

### IF NOT USING GITHUB ACTIONS

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

Make sure the DNS records are already pointing to the right IP address

Reload nginx so certbot finds the name: `sudo systemctl reload nginx`

app should now be running on HTTP

install certbot `sudo snap install --classic certbot`

`sudo certbot --nginx --email name@email.com --agree-tos`

### TO UPDATE MANUALLY

ssh into server
`su nodejs`
`cd ~/{folder where repo is}/`
`git pull`
`pm2 restart ETA`
