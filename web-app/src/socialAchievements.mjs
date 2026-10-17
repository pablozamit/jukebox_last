const KEYS = {
  first_vote: ['achievementFirstVote', 'achievementFirstVoteDesc'],
  protagonist: ['achievementProtagonist', 'achievementProtagonistDesc'],
  hitmaker: ['achievementHitmaker', 'achievementHitmakerDesc'],
  influencer: ['achievementInfluencer', 'achievementInfluencerDesc'],
  streak: ['achievementStreak', 'achievementStreakDesc'],
  loyal: ['achievementLoyal', 'achievementLoyalDesc'],
  early_bird: ['achievementEarlyBird', 'achievementEarlyBirdDesc'],
  night_owl: ['achievementNightOwl', 'achievementNightOwlDesc'],
};

export function getAchievementText(id, translation) {
  const [titleKey, descriptionKey] = KEYS[id] || [];
  return {
    title: titleKey ? translation[titleKey] : String(id || ''),
    description: descriptionKey ? translation[descriptionKey] : '',
  };
}
