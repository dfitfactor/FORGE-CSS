export type PortalSubmissionField = {
  label: string
  value: string
}

export type PortalSubmissionSection = {
  title: string
  fields: PortalSubmissionField[]
}

export type PortalSubmissionDocument = {
  title: string
  subtitle: string
  signature?: string | null
  sections: PortalSubmissionSection[]
}

type SubmissionShape = {
  slug: string
  name: string
  submitted_at: string | null
  signature_data: string | null
  responses: Record<string, unknown>
}

function asText(value: unknown, fallback = 'Not provided') {
  if (value === null || value === undefined) return fallback
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : fallback
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const text = String(value).trim()
  return text || fallback
}

function formatDate(value: unknown, fallback = 'Not provided') {
  if (!value) return fallback
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return asText(value, fallback)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function createField(label: string, value: unknown, formatter?: (value: unknown) => string): PortalSubmissionField {
  return {
    label,
    value: formatter ? formatter(value) : asText(value),
  }
}

function waiverSections(responses: Record<string, unknown>) {
  return [
    {
      title: 'Waiver Acknowledgments',
      fields: [
        createField('Health Disclosure', responses.health_disclosure),
        createField('Assumption of Responsibility', responses.assumption_of_responsibility),
        createField('Release of Liability', responses.release_of_liability),
        createField('Media Consent', responses.media_consent),
        createField('Signature Date', responses.signature_date, formatDate),
      ],
    },
  ]
}

function parqSections(responses: Record<string, unknown>) {
  return [
    {
      title: 'Health Screening',
      fields: [
        createField('Heart Condition Limits Activity', responses.heart_condition_limit_activity),
        createField('Chest Pain During Activity', responses.chest_pain_during_activity),
        createField('Chest Pain In Last 30 Days', responses.chest_pain_last_30_days),
        createField('Dizziness or Loss of Consciousness', responses.dizziness_or_loss_of_consciousness),
        createField('Bone or Joint Problem', responses.bone_or_joint_problem),
        createField('Prior Surgeries', responses.prior_surgeries),
        createField('Surgery Details', responses.surgery_details),
        createField('Current Medications', responses.medications),
        createField('Medication Details', responses.medication_details),
        createField('Medical Conditions Affecting Exercise', responses.medical_conditions),
        createField('Medical Condition Details', responses.medical_condition_details),
        createField('Additional Comments', responses.additional_comments),
        createField('Signature Date', responses.signature_date, formatDate),
      ],
    },
  ]
}

function weeklyCheckinSections(responses: Record<string, unknown>) {
  return [
    {
      title: 'Week Info',
      fields: [createField('Week Ending Date', responses.week_ending_date, formatDate)],
    },
    {
      title: 'Nutrition',
      fields: [
        createField('Food Journaling Days', responses.food_journaling_days),
        createField('Nutrition Drift Frequency', responses.nutrition_drift),
        createField('Protein Adherence', responses.protein_adherence),
        createField('Hydration Range', responses.hydration_range),
        createField('Nutrition Challenges', responses.nutrition_challenges),
      ],
    },
    {
      title: 'Sleep',
      fields: [
        createField('Sleep Hours', responses.sleep_hours),
        createField('Sleep Response', responses.sleep_response),
        createField('Sleep Hygiene', responses.sleep_hygiene),
      ],
    },
    {
      title: 'Training and Movement',
      fields: [
        createField('Workouts Completed', responses.workouts_completed),
        createField('Workout Types', responses.workout_types),
        createField('Movement vs Usual', responses.movement_vs_usual),
      ],
    },
    {
      title: 'Recovery and Energy',
      fields: [
        createField('Recovery Between Workouts', responses.recovery_quality),
        createField('Energy Level', responses.energy_level),
        createField('Stress Rating', responses.stress_rating),
        createField('Mindset Rating', responses.mindset_rating),
        createField('Digestion Quality', responses.digestion_quality),
      ],
    },
    {
      title: 'Reflection',
      fields: [
        createField('One Win', responses.one_win),
        createField('One Obstacle', responses.one_obstacle),
        createField('Something You Are Grateful For', responses.grateful_for),
        createField('Something You Did For Yourself', responses.did_for_self),
        createField('Based Mostly On Logs', responses.based_on_logs),
      ],
    },
  ]
}

function intakeSections(responses: Record<string, unknown>) {
  return [
    {
      title: 'Personal Information',
      fields: [
        createField('First Name', responses.first_name),
        createField('Last Name', responses.last_name),
        createField('Preferred Name', responses.preferred_name),
        createField('Mobile Phone', responses.mobile_phone),
        createField('Home Phone', responses.home_phone),
        createField('Email', responses.email),
        createField('Date of Birth', responses.date_of_birth, formatDate),
        createField('Gender', responses.gender),
        createField('Pronouns', responses.pronouns),
        createField('Street', responses.street),
        createField('City', responses.city),
        createField('State', responses.state),
        createField('Postal Code', responses.postal_code),
        createField('Occupation', responses.occupation),
        createField('Hours Per Week', responses.hours_per_week),
        createField('Relationship Status', responses.relationship_status),
      ],
    },
    {
      title: 'Emergency Contact',
      fields: [
        createField('First Name', responses.emergency_first_name),
        createField('Last Name', responses.emergency_last_name),
        createField('Relationship', responses.emergency_relationship),
        createField('Phone', responses.emergency_phone),
        createField('Email', responses.emergency_email),
      ],
    },
    {
      title: 'Goals and Motivation',
      fields: [
        createField('Primary Goals', responses.primary_goals),
        createField('90 Day Goal', responses.goal_90_days),
        createField('Why This Goal Matters', responses.goal_importance),
        createField('Past Obstacles', responses.past_obstacles),
      ],
    },
    {
      title: 'Health and Lifestyle',
      fields: [
        createField('Medical Conditions', responses.medical_conditions),
        createField('Additional Health Notes', responses.additional_health_notes),
        createField('Daily Activity Level', responses.activity_level),
        createField('Fitness Level', responses.fitness_level),
        createField('Training History', responses.training_history),
        createField('Meals Per Day', responses.meals_per_day),
        createField('Typical Foods', responses.typical_foods),
        createField('Taking Supplements', responses.taking_supplements),
        createField('Supplements List', responses.supplements_list),
        createField('Sleep Average Hours', responses.sleep_avg_hours),
        createField('Stress Level', responses.stress_level),
      ],
    },
    {
      title: 'Training Preferences and Signature',
      fields: [
        createField('Training Location', responses.training_location),
        createField('Preferred Training Days', responses.preferred_training_days),
        createField('Wellness Stage', responses.wellness_stage),
        createField('Wellness Stage Reason', responses.wellness_stage_reason),
        createField('Privacy Acknowledged', responses.privacy_acknowledged),
        createField('Signature Date', responses.signature_date, formatDate),
      ],
    },
  ]
}

function coachingAgreementSections(responses: Record<string, unknown>) {
  return [
    {
      title: 'Program Details',
      fields: [
        createField('Client Name', responses.clientName),
        createField('Client Email', responses.clientEmail),
        createField('Client Phone', responses.clientPhone),
        createField('Program', responses.programName),
        createField('Package', responses.packageName),
        createField('Session Duration', responses.sessionDuration),
        createField('Sessions Total', responses.sessionsTotal),
        createField('Sessions Per Week', responses.sessionsPerWeek),
        createField('Investment', responses.billingAmount),
        createField('Billing', responses.billingDisplay),
        createField('Commitment', responses.commitmentPeriod),
        createField('Start Date', responses.startDate),
      ],
    },
    {
      title: 'Agreement Confirmation',
      fields: [
        createField('Agreed To Terms', responses.agreed),
        createField('Print Name', responses.printName),
      ],
    },
  ]
}

export function buildPortalSubmissionDocument(submission: SubmissionShape): PortalSubmissionDocument {
  const submittedLabel = submission.submitted_at
    ? new Date(submission.submitted_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Submission date unavailable'

  const responses = submission.responses || {}

  const sections = submission.slug === 'waiver'
    ? waiverSections(responses)
    : submission.slug === 'parq'
    ? parqSections(responses)
    : submission.slug === 'weekly-checkin'
    ? weeklyCheckinSections(responses)
    : submission.slug === 'intake'
    ? intakeSections(responses)
    : submission.slug === 'coaching-agreement'
    ? coachingAgreementSections(responses)
    : [
        {
          title: 'Submitted Responses',
          fields: Object.entries(responses).map(([key, value]) => ({
            label: key.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()),
            value: asText(value),
          })),
        },
      ]

  return {
    title: submission.name,
    subtitle: `Completed on ${submittedLabel}`,
    signature: submission.signature_data,
    sections,
  }
}
