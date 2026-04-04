import { google } from 'googleapis'

const CALENDAR_TIMEZONE = 'America/New_York'

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
  const startDateTimeStr = `${date}T${time}:00`
  const endDate = new Date(`${date}T${time}:00`)
  endDate.setMinutes(endDate.getMinutes() + durationMinutes)
  const endHours = endDate.getHours().toString().padStart(2, '0')
  const endMins = endDate.getMinutes().toString().padStart(2, '0')
  const endDateTimeStr = `${date}T${endHours}:${endMins}:00`

  return {
    summary,
    description,
    start: {
      dateTime: startDateTimeStr,
      // TODO: Make coach calendar timezone configurable instead of hardcoding Eastern.
      timeZone: CALENDAR_TIMEZONE,
    },
    end: {
      dateTime: endDateTimeStr,
      timeZone: CALENDAR_TIMEZONE,
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
