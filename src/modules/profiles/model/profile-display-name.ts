import type { Profile } from '../types/profile.types'

type ProfileNameSource = Pick<Profile, 'email'> & {
  display_name?: string | null
}

export function getProfileDisplayName(profile: ProfileNameSource): string {
  const displayName = profile.display_name?.trim()
  if (displayName) return displayName

  const emailName = profile.email
    .split('@', 1)[0]
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/(^|\s)\S/g, (character) => character.toLocaleUpperCase())

  return emailName.slice(0, 60) || profile.email.trim().slice(0, 60) || 'User'
}
