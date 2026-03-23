import { google } from 'googleapis'

function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

function buildEventRequest({
  summary,
  description,
  date,
  time,
  durationMinutes,
  attendeeEmail,
  attendeeName,
}: {
  summary: string
  description: string
  date: string
  time: string
  durationMinutes: number
  attendeeEmail: string
  attendeeName: string
}) {
  const startDateTime = new Date(`${date}T${time}:00`)
  const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000)

  return {
    summary,
    description,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'America/New_York',
    },
    attendees: [{ email: attendeeEmail, displayName: attendeeName }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 60 },
      ],
    },
  }
}

export async function createCalendarEvent({
  summary,
  description,
  date,
  time,
  durationMinutes,
  attendeeEmail,
  attendeeName,
}: {
  summary: string
  description: string
  date: string
  time: string
  durationMinutes: number
  attendeeEmail: string
  attendeeName: string
}) {
  const calendar = getCalendarClient()

  const event = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    requestBody: buildEventRequest({
      summary,
      description,
      date,
      time,
      durationMinutes,
      attendeeEmail,
      attendeeName,
    }),
  })

  return event.data.id
}

export async function updateCalendarEvent(
  eventId: string,
  details: {
    summary: string
    description: string
    date: string
    time: string
    durationMinutes: number
    attendeeEmail: string
    attendeeName: string
  }
) {
  const calendar = getCalendarClient()

  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
    requestBody: buildEventRequest(details),
  })
}

export async function deleteCalendarEvent(eventId: string) {
  const calendar = getCalendarClient()

  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
  })
}
