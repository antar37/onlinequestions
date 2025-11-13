# Online Questions

An anonymous online question system with room support. Based on Thorsten Thormählen's original OnlineQuestions, adapted and updated with room functionality.

## Features

- **Anonymous Questions**: No sign-in or registration required
- **Room-based System**: Create multiple question rooms
- **Unique URLs**: Each room has its own URL that can be shared
- **Real-time Updates**: Questions appear immediately after submission
- **Simple Interface**: Clean, modern UI that works on all devices

## Requirements

- PHP 7.4 or higher
- Apache web server with mod_rewrite enabled
- Write permissions for the `rooms/` and `events/` directories

## Installation on DreamHost

### 1. Upload Files

Upload all files to your DreamHost domain's public directory (usually `~/yourdomain.com/` or `~/yourdomain.com/public_html/`).

### 2. Set Directory Permissions

Set the correct permissions for the directories:

```bash
chmod 755 rooms/
chmod 755 events/
```

The `.htaccess` file will automatically create these directories if they don't exist, but you can create them manually:

```bash
mkdir rooms
mkdir events
chmod 755 rooms events
```

### 3. Configure Apache

DreamHost typically has mod_rewrite enabled by default. The included `.htaccess` file will handle URL rewriting.

### 4. Test the Installation

1. Visit your domain: `https://yourdomain.com/`
2. Create a new room
3. Share the room URL with others
4. Test submitting questions

## Usage

### Creating a Room

1. Visit the homepage
2. Enter a room name
3. Click "Create Room"
4. Share the generated room URL

### Accessing a Room

- Use the room URL directly: `https://yourdomain.com/index.php?room=ROOMID`
- Or use the clean URL format: `https://yourdomain.com/room/ROOMID/`
- Or enter the room ID on the homepage

### Asking Questions

1. Navigate to a room
2. Type your question in the text area
3. Click "Submit Question"
4. Your question will appear immediately

## Security

- The `rooms/` and `events/` directories are protected from direct access via `.htaccess`
- Room IDs are randomly generated (8 characters)
- All user input is sanitized and escaped
- JSON files in the rooms directory are not directly accessible

## File Structure

```
onlinequestions/
├── index.php          # Main room page
├── create-room.php    # Room creation/access page
├── room-manager.php   # Room management functions
├── api.php            # API endpoint for questions
├── app.js             # Client-side JavaScript
├── styles.css         # Stylesheet
├── .htaccess          # Apache configuration
├── rooms/             # Room data storage (auto-created)
└── events/            # Event logs (auto-created)
```

## Customization

### Changing Room ID Length

Edit `ROOM_ID_LENGTH` in `index.php` and `room-manager.php`:

```php
define('ROOM_ID_LENGTH', 8); // Change to desired length
```

### Styling

Modify `styles.css` to customize the appearance. The design uses a purple gradient theme that can be easily changed.

### Room URL Format

The `.htaccess` file supports clean URLs. You can access rooms via:
- `index.php?room=ROOMID` (standard)
- `room/ROOMID/` (clean URL)

## Troubleshooting

### Questions not appearing

- Check that the `rooms/` directory has write permissions (755)
- Verify PHP error logs for any issues
- Ensure `api.php` is accessible

### Room not found

- Verify the room ID is correct (8 alphanumeric characters)
- Check that the `rooms/` directory exists and is writable

### URL rewriting not working

- Ensure mod_rewrite is enabled on your Apache server
- Verify `.htaccess` files are allowed (DreamHost allows them by default)
- Check that the `.htaccess` file is in the root directory

## License

MIT License - Based on Thorsten Thormählen's original OnlineQuestions

## Support

For issues or questions, please check:
- Apache error logs
- PHP error logs
- File permissions
- Directory existence

