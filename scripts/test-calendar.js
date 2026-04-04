require('dotenv').config({ path: '.env.local' })
const { google } = require('googleapis')

async function test() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    })

    const tokenResponse = await oauth2Client.getAccessToken()
    console.log('Token OK:', !!tokenResponse.token)

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const event = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      requestBody: {
        summary: 'FORGE Calendar Test - DELETE ME',
        description: 'Sprint 1 verification test',
        start: {
          dateTime: '2026-04-15T10:00:00',
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: '2026-04-15T11:00:00',
          timeZone: 'America/New_York',
        },
        attendees: [
          { email: 'coach@dfitfactor.com' },
        ],
      },
    })

    console.log('SUCCESS - Event created:', event.data.id)
    console.log('Event link:', event.data.htmlLink)
  } catch (err) {
    console.error('FAILED:', err.message)
    if (err.response) {
      console.error('Response:', JSON.stringify(err.response.data))
    }
  }
}

test()
