# Pair a device wirelessly

Mirin supports Android 11+ wireless debugging pairing and direct ADB wireless
connections. Both require the computer and phone to reach each other on the
same network; a VPN, guest Wi-Fi isolation, or firewall can prevent discovery.

## Android 11+ pairing

1. Enable Developer options and **Wireless debugging** on the phone.
2. In Mirin, open the connection flow and select wireless pairing.
3. On the phone choose **Pair device with pairing code**.
4. Enter the displayed address, pairing port, and six-digit code in Mirin.
5. After pairing, select the device's regular wireless-debugging service to
   connect and mirror it. Pairing and connection ports can differ.

Mirin can ask ADB for mDNS services to help discover Android 11+ endpoints.
Discovery is convenience, not a guarantee: enter the address and port shown by
the device if no service appears.

## Switch an existing USB device to wireless

Connect and authorize the device over USB first. From its device actions,
choose the wireless switch flow. Mirin asks ADB to enable TCP/IP mode and then
connects to the reported device address. Keep the USB cable attached until the
wireless connection is shown as connected.

## Disconnect or recover

Disconnecting a wireless device ends that ADB transport; it does not revoke a
pairing record on the phone. If a saved entry no longer connects, forget it in
Mirin, then pair or connect again. See [troubleshooting](troubleshooting.md)
for authorization and network failures.
