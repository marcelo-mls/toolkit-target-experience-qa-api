const { performance } = require('perf_hooks');
const services = require('../services/index');
const utils = require('../utils/benchmark');

// RETORNA OS DETALHES DE UM SPACE, COM VÁRIOS TIPOS DE ATIVIDADES E OFERTAS
async function getAllSpaceContent(req, res) {
  const start = performance.now(); // Marca o tempo de início para benchmark
  const requestedSpace = req.params.space.toLowerCase();

  try {
    const token = await services.generateTokenAPI();
    const [allApprovedActivities, allAudiences, allOffers] = await services.getAllAdobeListingAPIs(token);
    const requestedActivities = services.getRequestedActivities(allApprovedActivities, requestedSpace);

    if (requestedActivities.length === 0) {
      return res.status(404).json({
        message: '🕵️‍♂️ Procuramos, procuramos e... nada! Parece que não há experiências ativas neste espaço.',
        data: []
      });
    }

    const activitiesPromises = requestedActivities.map(async (activityOverview) => {
      const activityOverviewType = activityOverview.type.replace(/_/g, '').toLowerCase();

      const activityDetails = await services.fetchAdobeAPI('activity', token, activityOverview.id, activityOverviewType);

      if(activityDetails.error_code || activityDetails.errors) {
        activityDetails['id'] = activityOverview.id,
        activityDetails['type'] = activityOverviewType;
        console.error(activityDetails);
        return activityDetails;
      }

      const completeActivityDetails = services.buildCompleteActivity(activityDetails, activityOverview, allAudiences);
      return completeActivityDetails;
    });

    const activitiesResponses = await Promise.all(activitiesPromises);
    const activitiesWithError = activitiesResponses.filter((activity) => activity.error_code || activity.errors);

    if(activitiesWithError.length !== 0) return res.status(400).json({ status: 400, message: 'Bad Request', result: activitiesWithError});

    const completeSpaceContent = await Promise.all(activitiesResponses.map(async (activity) => {
      const offersPromises = services.buildOffersPromises(token, activity, allOffers);
      const offersResponses = await Promise.all(offersPromises);

      return { ...activity, options: offersResponses };
    }));

    completeSpaceContent.sort((a, b) => {
      const dateA = Date.parse(a.startsAt === 'when activated' ? a.endsAt : a.startsAt);
      const dateB = Date.parse(b.startsAt === 'when activated' ? b.endsAt : b.startsAt);

      return dateA - dateB || (b.priority - a.priority);
    });

    res.status(200).json(completeSpaceContent);
  } catch (error) {
    console.error('500', error);
    return res.status(500).json(error);
  }

  utils.benchmark(start, `NEW fetch space/mBox ${requestedSpace}`);
}

module.exports = {
  getAllSpaceContent,
};
