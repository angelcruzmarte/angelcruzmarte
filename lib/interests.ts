export interface InterestCategory {
  id: string
  label: string
  icon: string
}

// Categories shown on the Discover "Choose your interests" screen.
// `icon` maps to a lucide-react icon name used by the UI.
export const INTERESTS: InterestCategory[] = [
  { id: "arts", label: "Arts", icon: "Palette" },
  { id: "business", label: "Business", icon: "Briefcase" },
  { id: "comedy", label: "Comedy", icon: "Laugh" },
  { id: "education", label: "Education", icon: "GraduationCap" },
  { id: "fiction", label: "Fiction", icon: "BookOpen" },
  { id: "government", label: "Government", icon: "Landmark" },
  { id: "history", label: "History", icon: "ScrollText" },
  { id: "health-fitness", label: "Health & Fitness", icon: "HeartPulse" },
  { id: "kids-family", label: "Kids & Family", icon: "Users" },
  { id: "leisure", label: "Leisure", icon: "Gamepad2" },
  { id: "music", label: "Music", icon: "Music" },
  { id: "news", label: "News", icon: "Newspaper" },
  { id: "religion-spirituality", label: "Religion & Spirituality", icon: "Sparkles" },
  { id: "science", label: "Science", icon: "Atom" },
  { id: "society-culture", label: "Society & Culture", icon: "Globe" },
  { id: "sports", label: "Sports", icon: "Trophy" },
  { id: "technology", label: "Technology", icon: "Cpu" },
  { id: "true-crime", label: "True Crime", icon: "Fingerprint" },
  { id: "tv-film", label: "TV & Film", icon: "Clapperboard" },
]

export const INTEREST_LABELS = new Map(INTERESTS.map((i) => [i.id, i.label]))
