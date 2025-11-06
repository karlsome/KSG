# Raspberry Pi OPC UA Client Setup

## Installation

### 1. Install Python Dependencies

```bash
cd raspberry_pi
pip3 install -r requirements.txt
```

### 2. Configure Your Raspberry Pi

Edit `opcua_client.py` and set your unique Raspberry Pi ID:

```python
RASPBERRY_ID = "YOUR_UNIQUE_ID_HERE"  # e.g., "6C10F6"
```

This ID must match the `uniqueId` in your `masterUsers.devices` array in MongoDB.

### 3. Test Configuration

```bash
python3 opcua_client.py
```

## Running as a Service (Auto-start on boot)

### Create systemd service file:

```bash
sudo nano /etc/systemd/system/opcua-monitor.service
```

### Add this content:

```ini
[Unit]
Description=OPC UA Monitoring Client
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/KSG/raspberry_pi
ExecStart=/usr/bin/python3 /home/pi/KSG/raspberry_pi/opcua_client.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Enable and start service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable opcua-monitor.service
sudo systemctl start opcua-monitor.service
```

### Check service status:

```bash
sudo systemctl status opcua-monitor.service
```

### View logs:

```bash
sudo journalctl -u opcua-monitor.service -f
```

## Troubleshooting

### Connection Issues

1. **Unauthorized Error**: Verify your `RASPBERRY_ID` exists in `masterUsers.devices`
2. **OPC UA Connection Failed**: Check IP address and firewall settings
3. **Config Not Found**: Configure the device in the admin panel first

### Logs

All activity is logged to stdout. When running as a service, use `journalctl` to view logs.

## API Configuration

By default, the client connects to: `https://ksg-lu47.onrender.com`

To change the API server, edit `opcua_client.py`:

```python
API_BASE_URL = "https://your-server.com"
```
