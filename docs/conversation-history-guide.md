# Conversation History Guide

## Features Added

### 1. Save Conversations
- When you have an active chat, click the **💾 Save** button in the header
- Conversations are automatically titled based on your first question
- Each conversation stores all messages with timestamps

### 2. History Sidebar
- Click **Show History** button in the header to open the history sidebar
- View all past conversations for the current subject
- See message count and quick preview
- Click any conversation to load it back into the chat
- Delete conversations with the delete button

### 3. Profile & Notes View
- Click **Profile** button to see all saved conversations across all subjects
- Click **Load All Conversations** to refresh the list
- Conversations are displayed as cards with:
  - Subject badge (Math, Physics, etc.)
  - Title preview
  - Message count and last update date
  - Open and Delete buttons
- Click **Open** to load the conversation into chat
- Click **Delete** to permanently remove a conversation

## Database Schema

The conversation history is persisted in PostgreSQL with the following structure:

### Conversations Table
- `id`: Primary key
- `subject_id`: Subject name (Math, Physics, etc.)
- `title`: Auto-generated title from first message
- `created_at`: Timestamp when conversation started
- `updated_at`: Timestamp when last modified

### Messages Table
- `id`: Primary key
- `conversation_id`: Foreign key to conversations
- `role`: Either "user" or "assistant"
- `content`: The actual message text
- `created_at`: Timestamp when message was sent

## API Endpoints

- `GET /api/conversations` - List all conversations (optional `?subject_id=Math` filter)
- `GET /api/conversations/{id}` - Get a specific conversation with all messages
- `POST /api/conversations` - Save a new conversation
- `DELETE /api/conversations/{id}` - Delete a conversation

## Usage Tips

1. **Save Early**: Save conversations when you want to preserve important learning sessions
2. **Use Filters**: In chat view, history only shows conversations for the current subject
3. **Browse All**: Use the Profile view to see conversations across all subjects
4. **Clean Up**: Delete old or unimportant conversations to keep your history tidy
5. **Reload Anytime**: Close and reload conversations - they're persisted to the database

## Technical Notes

- Conversations are stored in the PostgreSQL database running in Docker
- The database schema is auto-created on backend startup
- Message feedback (thumbs up/down) is tracked but not yet persisted to database
- The history sidebar auto-refreshes when you save a conversation
- Loading a conversation replaces your current chat (unsaved work will be lost)

## Future Enhancements

- Search conversations by content
- Export conversations as PDF or Markdown
- Persist feedback ratings to database
- Tag and categorize conversations
- Share conversations with others
- Conversation analytics (study time, topics covered)
