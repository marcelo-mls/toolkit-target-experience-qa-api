const services = require('./adobe.services');

async function getAllAdobeListingAPIs(token) {
  const [activities, audiences, offers] = await Promise.all([
    services.fetchAdobeAPI('activities', token, null, 'approved'),
    services.fetchAdobeAPI('audiences', token),
    services.fetchAdobeAPI('offers', token),
  ]);

  return [activities.activities, audiences.audiences, offers.offers];
}

function getSchedulingAccordingToInterface(activity) {
  /* 
  status da API: approved|deactivated|paused|saved|deleted
  status da interface: live|scheduled|ended|archived|inactive|draft|syncing
  
  mapeados:
    approved = live|scheduled|ended
    deactivated = archived
    saved = inactive
  */
 
  let scheduling = '';
  const start = activity?.startsAt || activity.lifetime?.start;
  const end = activity?.endsAt || activity.lifetime?.end;

  const startsDate = start ? new Date(start) : null;
  const endsDate = end ? new Date(end) : null;
  const today = new Date();

  const isStartDateMissing = !startsDate;
  const isEndDateMissing = !endsDate;
  const isTodayAfterStart = startsDate && today >= startsDate;
  const isTodayBeforeEnd = endsDate && today <= endsDate;
  const isTodayAfterEnd = endsDate && today > endsDate;
  
  const isLive = isStartDateMissing || (isTodayAfterStart && (isEndDateMissing || isTodayBeforeEnd));

  if (isLive) {
    scheduling = 'live';
  } else if (isTodayAfterEnd) {
    scheduling = 'expired';
  } else {
    scheduling = 'scheduled';
  }

  return [scheduling, start, end];
}

function getRequestedActivities(activities, requestedSpace) {
  const requestedActivities = activities.filter((activity) => {

    const spaceNameClean = activity.name.replace(/\s/g, '').toLowerCase();
    const hasTargetSpaceInName = spaceNameClean.includes(requestedSpace);

    const [scheduling, startsDate, endsDate] = getSchedulingAccordingToInterface(activity);
    
    if (hasTargetSpaceInName && scheduling !== 'expired') {
      activity['scheduling'] = scheduling;
      activity['startsAt'] = startsDate;
      activity['endsAt'] = endsDate;

      return true;
    }
    return false;

  });

  return requestedActivities;
}

function getAudienceDetails(audienceIds, audienceList) {
  let name = '';

  if (audienceIds.length === 0) {
    name = 'ALL VISITORS';
  } else {
    const audienceOverview = audienceList.find((audience) => audience.id === audienceIds[0]);
    name = audienceOverview ? audienceOverview.name || audienceOverview.type : 'AUDIENCE NOT FOUND';
  }

  return { name, id: audienceIds[0] };
}

function buildCompleteActivity(activityDetails, activityOverview, audienceList) {
  /* 
  Os dados da API de UMA atividade são organizados de maneira a representar informações sobre experiences, locations e options associadas a cada experiência.
  
  O relacionamento entre esses dados ocorre da seguinte forma:
  - experiences: Cada objeto experience contém um identificador único e uma lista de options associadas. A chave que faz essa ligação é o optionLocalId.
  - locations: Cada objeto location contém um identificador único que é utilizado para associar a location com as experiências. A chave que faz essa ligação é o locationLocalId.
  - options: Cada objeto option está associada a uma experiência através do optionLocalId.
  */

  let positionCounter = 0;
  const { experiences, locations, options, priority } = activityDetails;
  
  // Mesclar experiences com suas respectivas locations com base no locationLocalId
  const experiencesWithLocations = experiences.map((experience) => {
    const enrichedExperience = { ...experience, position: ++positionCounter };
    
    enrichedExperience['mbox'] = experience.optionLocations.map((ol) => {
      return locations.mboxes.find((mbox) => mbox.locationLocalId === ol.locationLocalId);
    })[0];
    
    return enrichedExperience;
  });

  // Mesclar experiences com suas respectivas options com base no optionLocalId
  const enrichedOptions = options.map((option) => {
    const correspondingExperience = experiencesWithLocations.find((experience) => 
      experience.optionLocations.some((ol) => ol.optionLocalId === option.optionLocalId)
    );

    if (correspondingExperience) {
      const audienceIds = activityOverview.type === 'xt' ? correspondingExperience.audienceIds : correspondingExperience.mbox.audienceIds;

      return { 
        ...option,
        audienceDetails: getAudienceDetails(audienceIds, audienceList),
        ordination: {
          priority: priority, 
          position: correspondingExperience.position,
        },
        experience: {
          experienceLocalId: correspondingExperience.experienceLocalId,
          name: correspondingExperience.name,
          audienceIds: correspondingExperience.audienceIds,
          mbox: correspondingExperience.mbox
        },
        visitorPercentage: correspondingExperience?.visitorPercentagetype ? correspondingExperience.visitorPercentage : 'N/A',
      };
    }
    return option;
  });

  delete activityDetails.locations;
  delete activityDetails.experiences;
  if(!activityDetails.startsAt) activityDetails['startsAt'] = activityOverview.startsAt || 'when activated';
  if(!activityDetails.endsAt) activityDetails['endsAt'] = activityOverview.endsAt || 'when deactivated';
  
  return {
    ...activityDetails,
    type: activityOverview.type,
    scheduling: activityOverview.scheduling,
    options: enrichedOptions.sort((a, b) => a.ordination.position - b.ordination.position)
  };
}

function buildOffersPromises(token, activity, listOffers) {
  const offersPromises = activity.options.map(async (option) => {
    const offer = listOffers.find((offer) => offer.id === option.offerId);

    const offerDetails = await services.fetchAdobeAPI('offer', token, offer.id, offer.type);

    const { scheduling, startsAt, endsAt } = activity;
    option['scheduling'] = { status: scheduling, startsAt, endsAt };
    option['type'] = {activity: activity.type ,offer: offer.type};
    const { id, content } = offerDetails;

    return { ...option, offerDetails: { id, content } };
  });

  return offersPromises;
}

module.exports = {
  getAllAdobeListingAPIs,
  getRequestedActivities,
  getAudienceDetails,
  buildCompleteActivity,
  buildOffersPromises,
};