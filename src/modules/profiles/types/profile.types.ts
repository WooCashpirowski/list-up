export type Profile = {
  id: string
  email: string
  created_at: string
  updated_at: string
}

export type ProfileInsert = {
  id: string
  email: string
  created_at?: string
  updated_at?: string
}

export type ProfileUpdate = {
  id?: string
  email?: string
  created_at?: string
  updated_at?: string
}

export type CreateProfileInput = Pick<ProfileInsert, 'id' | 'email'>

export type UpdateProfileInput = Pick<ProfileUpdate, 'email'>
