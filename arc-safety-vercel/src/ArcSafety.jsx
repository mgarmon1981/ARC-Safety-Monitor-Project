import { useEffect, useMemo, useState } from 'react'

const INITIAL_INPUTS = {
  ph: '7.24',
  pco2: '29',
  hco3: '12',
  sbe: '-13',
  na: '139',
  cl: '103',
  alb: '24',
  lactate: '3',
  crrtArc: true,
  caTotal: '2.25',
  caIonico: '1.02',
  calciumIv: '5',
  ratioTrend: 'rising',
  lactateTrend: 'rising',
  vasoTrend: 'rising',
  highRiskContext: true,
  technicalAlarm: 'no',
  unexplainedAcidosisManual: false
}

const CLINICAL_TEST_CASES = [
  {
    name: 'Acumulación precoz sin ratio >2.5',
    expected: 'Alta sospecha',
    inputs: { ph: '7.24', pco2: '29', hco3: '12', sbe: '-13', na: '139', cl: '103', alb: '24', lactate: '3', caTotal: '2.25', caIonico: '1.02', ratioTrend: 'rising', lactateTrend: 'rising', vasoTrend: 'rising', highRiskContext: true, technicalAlarm: 'no' }
  },
  {
    name: 'Falso positivo técnico de calcio',
    expected: 'Alta sospecha no confirmada / descartar técnica',
    inputs: { ph: '7.37', pco2: '39', hco3: '24', sbe: '0', na: '139', cl: '104', alb: '25', lactate: '2.3', caTotal: '2.38', caIonico: '0.92', calciumIv: '7', ratioTrend: 'rising', lactateTrend: 'stable', vasoTrend: 'stable', highRiskContext: false, technicalAlarm: 'yes_unchecked' }
  },
  {
    name: 'Alcalosis por exceso tampón metabolizado',
    expected: 'Bajo riesgo con exceso tampón',
    inputs: { ph: '7.51', pco2: '48', hco3: '36', sbe: '11', na: '142', cl: '98', alb: '26', lactate: '1.5', caTotal: '2.18', caIonico: '1.08', ratioTrend: 'stable', lactateTrend: 'stable', vasoTrend: 'stable', highRiskContext: false, technicalAlarm: 'no' }
  }
]

function n(value) {
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

function fmt(value, digits = 1) {
  if (!Number.isFinite(value)) return '—'
  return (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits)
}

function sidReference(ph) {
  const adjustment = 1.5 * (Math.abs(ph - 7.4) / 0.1)
  if (ph < 7.4) return 35 + adjustment
  if (ph > 7.4) return 35 - adjustment
  return 35
}

function computeAcidBase(inputs) {
  const ph = n(inputs.ph)
  const pco2 = n(inputs.pco2)
  const hco3 = n(inputs.hco3)
  const sbe = n(inputs.sbe)
  const na = n(inputs.na)
  const cl = n(inputs.cl)
  const alb = n(inputs.alb)
  const lactate = n(inputs.lactate)

  if ([ph, pco2, hco3, sbe, na, cl, alb].some((v) => !Number.isFinite(v))) return null

  const sidRef = sidReference(ph)
  const naCl = na - cl
  const sbeSid = naCl - sidRef
  const sbeAlb = 0.3 * (40 - alb)
  const sbeUi = sbe - sbeSid - sbeAlb
  const uiResidual = Number.isFinite(lactate) ? sbeUi + lactate : NaN
  const relevantUnmeasuredAnions =
    Number.isFinite(uiResidual) &&
    uiResidual <= -4
  const unmeasuredAnionsSeverity =
    uiResidual <= -8 ? 'severe' :
    uiResidual <= -6 ? 'moderate' :
    relevantUnmeasuredAnions ? 'mild' :
    'none'
  const expectedPco2 = 1.5 * hco3 + 8
  const lowPco2 = expectedPco2 - 2
  const highPco2 = expectedPco2 + 2

  const chronicHypercapnia = pco2 > 50 && hco3 > 30 && sbe > 0 && ph <= 7.4
  const metabolicAlkalosisPattern = ph > 7.45 && hco3 > 30 && sbe > 2
  const meaningfulMetabolicBurden = Math.abs(sbe) >= 2 || Math.abs(sbeSid) >= 3 || Math.abs(sbeAlb) >= 2 || Math.abs(sbeUi) >= 4

  let resp = 'Compensación respiratoria dentro del rango esperado.'
  if (chronicHypercapnia) resp = 'Posible trastorno respiratorio primario crónico. Interpretar Boston con cautela.'
  else if (metabolicAlkalosisPattern && pco2 > 45) resp = 'Compensación respiratoria compatible con alcalosis metabólica primaria.'
  else if (meaningfulMetabolicBurden) {
    if (pco2 > highPco2) resp = 'PCO₂ mayor de lo esperado: compensación insuficiente o acidosis respiratoria asociada.'
    else if (pco2 < lowPco2) resp = 'PCO₂ menor de lo esperado: alcalosis respiratoria asociada.'
  } else resp = 'Sin evidencia clara de carga metabólica relevante: interpretar en contexto clínico.'

  const hiddenComplexity = Math.abs(sbe) <= 2 && (Math.abs(sbeSid) >= 3 || Math.abs(sbeAlb) >= 2 || Math.abs(sbeUi) >= 4)
  const ratio = inputs.crrtArc ? n(inputs.caTotal) / n(inputs.caIonico) : NaN
  const ratioRising = inputs.ratioTrend === 'rising'

  const nearNormalAcidBase =
    ph >= 7.32 &&
    ph <= 7.45 &&
    hco3 >= 20 &&
    sbe > -3

  const unexplainedAcidosis =
    !nearNormalAcidBase &&
    sbeUi <= -4 &&
    (
      !Number.isFinite(lactate) ||
      lactate < 2 ||
      (
        lactate >= 2 &&
        uiResidual <= -6 &&
        (
          (Number.isFinite(ratio) && ratio >= 2.25) ||
          ratioRising ||
          sbe <= -8 ||
          ph < 7.25 ||
          hco3 < 16
        )
      )
    )

  const summary = []
  if (hiddenComplexity) summary.push('SBE aparentemente normal con trastornos metabólicos opuestos coexistentes.')
  summary.push(resp)
  if (sbeSid <= -3) summary.push('Acidosis por bajo SID / hipercloremia relativa.')
  if (sbeSid >= 3) {
    if (inputs.crrtArc && ph > 7.45 && hco3 > 30) summary.push('Alcalosis metabólica por alto SID en contexto TCRR + ARC: patrón compatible con exceso de carga tampón por citrato adecuadamente metabolizado. Valorar impacto de la prescripción sobre la carga neta de tampón.')
    else summary.push('Alcalosis por alto SID / hipocloremia relativa.')
  }
  if (sbeAlb >= 2) summary.push('Hipoalbuminemia con efecto alcalinizante: puede ocultar acidosis relevantes.')
  if (sbeUi <= -4) {
    if (
      unmeasuredAnionsSeverity === 'none' &&
      Number.isFinite(lactate) &&
      lactate < 2 &&
      (
        uiResidual <= -4 ||
        sbe <= -5 ||
        ph < 7.32
      )
    ) {
      summary.push('Acidosis por aniones no medidos no explicada por lactato: valorar uremia, cetonas, tóxicos u otros aniones según contexto.')
    } else if (unmeasuredAnionsSeverity === 'none' && Number.isFinite(lactate) && lactate >= 2 && uiResidual <= -6) {
      summary.push('Acidosis importante por aniones no medidos no explicada por lactato.')
    } else if (unmeasuredAnionsSeverity === 'none' && Number.isFinite(lactate) && lactate >= 2 && uiResidual <= -4 && uiResidual > -6) {
      summary.push('Residual moderado de aniones no medidos tras lactato: interpretar en contexto y valorar tendencia.')
    } else if (unmeasuredAnionsSeverity === 'none' && Number.isFinite(lactate) && lactate >= 2) {
      summary.push('El lactato explica la mayor parte del componente de UI.')
    }
  }
  if (unmeasuredAnionsSeverity === 'mild') {
    summary.push('🧪 Aniones no medidos relevantes: residual leve-moderado tras lactato. No atribuir automáticamente a citrato; considerar cetonas, uremia, pirroglutamato, tóxicos u otros aniones según contexto.')
  } else if (unmeasuredAnionsSeverity === 'moderate') {
    summary.push('🧪 Acidosis relevante por aniones no medidos no explicada por lactato. Considerar cetonas, uremia, pirroglutamato, tóxicos, acumulación de citrato u otros aniones según contexto.')
  } else if (unmeasuredAnionsSeverity === 'severe') {
    summary.push('🧪 Acidosis importante por aniones no medidos no explicada por lactato. Priorizar diagnóstico diferencial: cetonas, uremia, pirroglutamato, tóxicos, acumulación de citrato u otros aniones.')
  }

  return { ph, pco2, hco3, sbe, na, cl, alb, lactate, sidRef, naCl, sbeSid, sbeAlb, sbeUi, uiResidual, relevantUnmeasuredAnions, unmeasuredAnionsSeverity, expectedPco2, lowPco2, highPco2, resp, summary, unexplainedAcidosis }
}

function computeArc(inputs, acidBase) {
  if (!inputs.crrtArc || !acidBase) return null
  const caTotal = n(inputs.caTotal)
  const caIonico = n(inputs.caIonico)
  if (!Number.isFinite(caTotal) || !Number.isFinite(caIonico) || caIonico <= 0) return null

  const ratio = caTotal / caIonico
  const ratioRising = inputs.ratioTrend === 'rising'
  const lactateRising = inputs.lactateTrend === 'rising'
  const vasoRising = inputs.vasoTrend === 'rising'
  const technicalChecked = inputs.technicalAlarm === 'yes_checked'
  const technicalUnchecked = inputs.technicalAlarm === 'yes_unchecked'
  const calciumIv = n(inputs.calciumIv)
  const rawUnexplainedAcidosis = acidBase.unexplainedAcidosis || inputs.unexplainedAcidosisManual
  const severeShockConfounder =
    acidBase.lactate >= 6 &&
    inputs.highRiskContext &&
    ratio < 2.15 &&
    !ratioRising &&
    caIonico >= 1.0 &&
    inputs.technicalAlarm === 'no'
  const unexplainedAcidosis = rawUnexplainedAcidosis && !severeShockConfounder
  const realDynamicSignals = [ratioRising, lactateRising, vasoRising].filter(Boolean).length
  const technicalConcern = technicalUnchecked && caIonico < 0.95 && ratio >= 2.25
  const ratioVeryHigh = ratio >= 2.7
  const compatibleSignalWithHighRatio =
    ratioRising ||
    lactateRising ||
    vasoRising ||
    inputs.highRiskContext ||
    unexplainedAcidosis ||
    caIonico < 0.95
  const calciumIvEscalationSignal =
    ratioRising &&
    Number.isFinite(calciumIv) &&
    calciumIv >= 7
  const ratioHighWithCompatibleSignal = ratio > 2.5 && compatibleSignalWithHighRatio
  const hasMajorSignal = ratioHighWithCompatibleSignal || ratioVeryHigh || unexplainedAcidosis || technicalChecked || calciumIvEscalationSignal
  const weakCalciumSignal =
    ratio < 2.30 &&
    !technicalChecked &&
    caIonico >= 0.95
  const metabolicDeteriorationWithUnmeasuredAnions =
    (weakCalciumSignal || (ratio >= 2.30 && ratio <= 2.50 && !technicalChecked)) &&
    unexplainedAcidosis &&
    (lactateRising || vasoRising || inputs.highRiskContext) &&
    acidBase.relevantUnmeasuredAnions
  const strongCalciumSignalForRed = ratioVeryHigh || ratioHighWithCompatibleSignal || technicalChecked || calciumIvEscalationSignal

  let status = '🟢 Bajo riesgo'
  let level = 'green'
  let title = inputs.highRiskContext ? 'Metabolismo adecuado del citrato en contexto de alto riesgo metabólico' : 'Patrón compatible con metabolismo adecuado del citrato'
  let action = inputs.highRiskContext ? 'Mantener monitorización protocolizada con vigilancia reforzada por contexto de alto riesgo metabólico.' : 'Continuar monitorización habitual según protocolo.'
  let confidence = inputs.highRiskContext ? 'Estable, con vigilancia prudente por contexto de alto riesgo metabólico.' : 'Alta si la evolución permanece estable'

  const citrateBufferExcess = acidBase.ph > 7.45 && acidBase.hco3 > 30 && acidBase.sbe > 5 && acidBase.sbeSid >= 3 && ratio < 2.25 && !ratioRising && !lactateRising && !vasoRising && !unexplainedAcidosis

  if (!technicalUnchecked && !severeShockConfounder && strongCalciumSignalForRed) {
    status = '🔴 Alta sospecha'
    level = 'red'
    title = 'Metabolismo insuficiente / acumulación de citrato probable'
    action = 'Revisar perfusión, compensación de calcio y prescripción ARC; repetir control precoz y valorar ajuste según evolución clínica. Considerar suspensión inmediata de ARC o transición temporal a otra estrategia de anticoagulación si existe trayectoria convergente, ratio claramente elevado, hipocalcemia persistente o escalada de calcio IV pese a revisión técnica.'
    confidence = 'Alta concordancia entre bioquímica, dinámica clínica y hemodinámica.'
  } else if ((ratio >= 2.25 && ratio <= 2.5) || ratio > 2.5 || realDynamicSignals >= 2 || (inputs.highRiskContext && realDynamicSignals >= 1) || technicalChecked || technicalConcern || unexplainedAcidosis) {
    status = '🟡 Riesgo intermedio'
    level = 'amber'
    const stewartQuiet = acidBase.ph >= 7.32 && acidBase.sbe > -4 && acidBase.sbeUi > -4 && !unexplainedAcidosis
    const isolatedBiochemicalSignal = ratio >= 2.25 && ratio <= 2.5 && !ratioRising && !lactateRising && !vasoRising && stewartQuiet
    const contextualWatch = ratio < 2.25 && !ratioRising && !unexplainedAcidosis && inputs.highRiskContext && (lactateRising || vasoRising || acidBase.lactate >= 6 || severeShockConfounder)
    const ratioGreyZone = ratio >= 2.30 && ratio <= 2.50

    if (metabolicDeteriorationWithUnmeasuredAnions) {
      status = '🟡 Deterioro metabólico en contexto de ARC'
      title = 'Existe deterioro metabólico progresivo con aniones no medidos relevantes. La evidencia específica de acumulación de citrato es actualmente insuficiente.'
      confidence = 'Existe deterioro metabólico relevante; la señal cálcica específica de acumulación de citrato es actualmente limitada.'
    } else if (contextualWatch) {
      title = severeShockConfounder
        ? 'Vigilancia reforzada: alto riesgo metabólico sin evidencia bioquímica actual de acumulación de citrato'
        : 'Vigilancia contextual: sin evidencia bioquímica de acumulación de citrato'
      confidence = 'Interpretar con cautela: existe contexto de riesgo, pero sin patrón convergente de acumulación de citrato.'
    } else if (ratioGreyZone) {
      title = 'Vigilancia bioquímica ARC'
      confidence = 'Ratio tCa/iCa en zona de vigilancia. Requiere reevaluación precoz y análisis de tendencia antes de asumir acumulación de citrato.'
    } else {
      title = isolatedBiochemicalSignal ? 'Vigilancia bioquímica sin convergencia fisiopatológica' : ratio > 2.5 && !ratioRising && !lactateRising && !vasoRising && !inputs.highRiskContext && !unexplainedAcidosis ? 'Señal bioquímica compatible con posible metabolismo insuficiente del citrato' : 'Señales compatibles con metabolismo insuficiente parcial del citrato'
      confidence = isolatedBiochemicalSignal ? 'Cautela: existe señal bioquímica aislada, pero sin convergencia metabólica ni dinámica.' : ratio > 2.5 && !ratioRising && !lactateRising && !vasoRising && !inputs.highRiskContext && !unexplainedAcidosis ? 'Interpretar en contexto: señal bioquímica aislada sin convergencia fisiopatológica actual.' : 'Interpretar con cautela: vigilar convergencia de señales dinámicas.'
    }
    action = isolatedBiochemicalSignal ? 'Repetir control precoz y reevaluar tendencia del ratio tCa/iCa y del equilibrio ácido–base antes de asumir metabolismo insuficiente del citrato.' : 'Reforzar monitorización y repetir control precoz en 2–4 h, priorizando la evaluación de tendencia.'
  }

  if (technicalUnchecked && (ratio >= 2.25 || caIonico < 0.95)) {
    status = '🟡 Riesgo intermedio'
    level = 'amber'
    title = ratio > 2.5 ? 'Alta sospecha no confirmada: descartar problema técnico de reposición cálcica' : 'Señal cálcica de interpretación incierta: descartar problema técnico de reposición'
    action = 'Antes de interpretar la hipocalcemia como señal de metabolismo insuficiente del citrato, verificar concentración, bomba, velocidad, vía, conexión, permeabilidad y extravasación de la infusión de calcio; repetir control tras el check.'
    confidence = 'Interpretar con cautela: la señal cálcica no es diagnóstica hasta confirmar seguridad técnica de la reposición.'
  }

  if (citrateBufferExcess) {
    status = '🟢 Bajo riesgo'
    level = 'green'
    title = 'Metabolismo adecuado del citrato con señal de exceso de tampón metabólico'
    action = 'Valorar ajustes en la prescripción con impacto en la carga neta de tampón de la técnica (flujo de sangre, dosis de citrato, flujo de reposición/diálisis), manteniendo monitorización habitual.'
    confidence = 'Alta: patrón compatible con citrato adecuadamente metabolizado, sin señales de acumulación.'
  }

  const why = []
  if (ratio > 2.5) why.push('Ratio tCa/iCa >2.5')
  else if (ratio >= 2.25) why.push('Ratio tCa/iCa en zona de vigilancia')
  else if (level === 'red' && ratioRising) why.push('Ratio tCa/iCa ascendente (aún no elevado, sospecha basada en dinámica clínica)')
  else if (level === 'red') why.push('Ratio tCa/iCa aún no elevado: sospecha basada en dinámica clínica')
  else if (ratioRising) why.push('Ratio tCa/iCa ascendente')
  if (lactateRising) why.push('Lactato ascendente')
  if (vasoRising) why.push('Aumento de requerimientos vasoactivos')
  if (inputs.highRiskContext) why.push('Contexto de alto riesgo metabólico')
  if (severeShockConfounder) why.push('Lactato extremo en shock profundo: interpretar Stewart con cautela si ratio bajo y estable')
  if (unexplainedAcidosis) why.push('Acidosis no explicada por lactato')
  if (technicalUnchecked && (ratio >= 2.25 || caIonico < 0.95)) why.push('Hipocalcemia con infusión de calcio no verificada: descartar problema técnico antes de asumir acumulación')
  if (technicalChecked) why.push('Hipocalcemia persistente pese a check técnico correcto')

  return { ratio, status, level, title, action, confidence, why, unexplainedAcidosis }
}

function finiteSeries(timeline, key) {
  return timeline
    .map((point) => n(point?.[key]))
    .filter((value) => Number.isFinite(value))
}

function lastFinite(timeline, key) {
  const values = finiteSeries(timeline, key)
  return values.length ? values[values.length - 1] : NaN
}

function valueRange(values) {
  if (!values.length) return NaN
  return Math.max(...values) - Math.min(...values)
}

function countRises(values, minDelta = 0) {
  let rises = 0
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] - values[index - 1] > minDelta) rises += 1
  }
  return rises
}

function countFalls(values, minDelta = 0) {
  let falls = 0
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] - values[index] > minDelta) falls += 1
  }
  return falls
}

function summarizeChange(label, first, last, digits = 2) {
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  const direction = last > first ? 'sube' : last < first ? 'baja' : 'permanece sin cambios'
  return `${label} ${direction} de ${fmt(first, digits)} a ${fmt(last, digits)}`
}

function computeLongitudinalTrajectory(timeline) {
  if (timeline.length < 2) {
    return {
      level: 'neutral',
      title: 'Sin trayectoria suficiente',
      text: 'Guarda al menos dos controles para interpretar evolución longitudinal.'
    }
  }

  const last = timeline[timeline.length - 1]
  const previous = timeline[timeline.length - 2]
  const ratios = finiteSeries(timeline, 'ratio')
  const ionizedCalcium = finiteSeries(timeline, 'caIonico')
  const calciumIv = finiteSeries(timeline, 'calciumIv')
  const lactates = finiteSeries(timeline, 'lactate')
  const sbes = finiteSeries(timeline, 'sbe')
  const ratioRiseCount = countRises(ratios, 0.03)
  const calciumIvRiseCount = countRises(calciumIv, 0.2)
  const ionizedCalciumFallCount = countFalls(ionizedCalcium, 0.03)
  const ratioProgressiveRise = ratios.length >= 3 && ratioRiseCount >= ratios.length - 2 && ratios[ratios.length - 1] > ratios[0] + 0.08
  const calciumReplacementEscalating = calciumIv.length >= 2 && calciumIvRiseCount >= Math.max(1, calciumIv.length - 2)
  const ionizedCalciumFalling = ionizedCalcium.length >= 2 && ionizedCalciumFallCount >= Math.max(1, ionizedCalcium.length - 2)
  const maxRatio = ratios.length ? Math.max(...ratios) : NaN
  const lastRatio = ratios[ratios.length - 1]
  const firstRatio = ratios[0]
  const ratioReassuring =
    ratios.length >= 3 &&
    Number.isFinite(maxRatio) &&
    maxRatio < 2.15
  const noSustainedRatioRise =
    ratios.length >= 3 &&
    !(lastRatio > firstRatio + 0.25 && ratioRiseCount >= 2)
  const noCalciumEscalation =
    calciumIv.length < 2 ||
    calciumIv[calciumIv.length - 1] <= calciumIv[0] + 0.5
  const noIonizedCalciumFall =
    ionizedCalcium.length < 2 ||
    ionizedCalcium[ionizedCalcium.length - 1] >= ionizedCalcium[0] - 0.08
  const recoveredAfterTechnicalIssue =
    last.level === 'green' &&
    timeline.some((point) => point.technicalAlarm === 'yes_unchecked') &&
    last.technicalAlarm === 'no' &&
    Number.isFinite(previous?.ratio) &&
    Number.isFinite(last.ratio) &&
    last.ratio < previous.ratio &&
    Number.isFinite(previous?.calciumIv) &&
    Number.isFinite(last.calciumIv) &&
    last.calciumIv <= previous.calciumIv
  const redControls = timeline.filter((point) => point.level === 'red').length
  const convergentSignals = [
    ratioProgressiveRise,
    calciumReplacementEscalating,
    ionizedCalciumFalling,
    redControls >= 1,
    last.ratioTrend === 'rising'
  ].filter(Boolean).length
  const globalCitrateConvergence =
    ratios.length >= 4 &&
    Number.isFinite(lastRatio) &&
    Number.isFinite(firstRatio) &&
    lastRatio >= 2.60 &&
    lastRatio > firstRatio + 0.20 &&
    (
      calciumReplacementEscalating ||
      ionizedCalciumFalling ||
      redControls >= 2
    )
  const nonConvergentPattern =
    timeline.length >= 4 &&
    ratioReassuring &&
    noSustainedRatioRise &&
    noCalciumEscalation &&
    noIonizedCalciumFall &&
    !ratioProgressiveRise &&
    !calciumReplacementEscalating &&
    !ionizedCalciumFalling
  const summaryParts = [
    summarizeChange('ratio tCa/iCa', ratios[0], lastFinite(timeline, 'ratio'), 2),
    summarizeChange('calcio ionico', ionizedCalcium[0], lastFinite(timeline, 'caIonico'), 2),
    summarizeChange('reposicion calcica', calciumIv[0], lastFinite(timeline, 'calciumIv'), 1),
    summarizeChange('lactato', lactates[0], lastFinite(timeline, 'lactate'), 1),
    summarizeChange('SBE', sbes[0], lastFinite(timeline, 'sbe'), 1)
  ].filter(Boolean)
  const narrative = summaryParts.length
    ? `Resumen longitudinal automático: ${summaryParts.join('; ')}.`
    : 'Resumen longitudinal automático: controles seriados guardados, con datos numéricos incompletos para cuantificar la evolución.'

  if (recoveredAfterTechnicalIssue) {
    return {
      level: 'green',
      title: 'Trayectoria no convergente para acumulación de citrato',
      text: `${narrative} Tras la revisión técnica, el último control mejora sin aumento de reposición cálcica; trayectoria no compatible con acumulación sostenida.`
    }
  }

  if ((ratioProgressiveRise && convergentSignals >= 2) || globalCitrateConvergence) {
    return {
      level: 'red',
      title: 'Trayectoria convergente para acumulación de citrato',
      text: `${narrative} Se detecta una trayectoria compatible con metabolismo insuficiente del citrato, por ascenso progresivo o convergencia global del ratio tCa/iCa junto con señales cálcicas/metabólicas acompañantes.`
    }
  }

  if (nonConvergentPattern) {
    return {
      level: 'green',
      title: 'Trayectoria no convergente para acumulación de citrato',
      text: `${narrative} La evolución seriada no muestra convergencia fisiopatológica compatible con acumulación de citrato. Persistencia de contexto de alto riesgo metabólico con estabilidad de la señal cálcica y ausencia de progresión bioquímica ARC.`
    }
  }

  return {
    level: 'amber',
    title: 'Trayectoria en vigilancia',
    text: `${narrative} La serie muestra señales intermedias sin patrón claramente convergente ni no convergente; mantener vigilancia longitudinal y nuevo control precoz según contexto.`
  }
}

function makeClipboardText(inputs, acidBase, arc) {
  const NL = String.fromCharCode(10)
  const timestamp = new Date().toLocaleString('es-ES')
  const stewartSummary = acidBase?.summary?.map((item) => `• ${item}`).join(NL) || '• Sin interpretación disponible'
  const whySummary = arc?.why?.length
    ? arc.why.map((item) => `• ${item}`).join(NL)
    : '• Sin señales dinámicas de alarma'

  if (!inputs.crrtArc) {
    return [
      'STEWART LIGHT',
      `Fecha/hora: ${timestamp}`,
      '',
      'Interpretación fisiopatológica:',
      stewartSummary,
      '',
      'Compensación respiratoria:',
      acidBase?.resp || 'No disponible'
    ].join(NL)
  }

  const ratioText = Number.isFinite(arc?.ratio) ? fmt(arc.ratio, 2) : '—'

  const trajectory = []
  if (inputs.ratioTrend === 'rising') trajectory.push('• Ratio tCa/iCa ascendente')
  if (inputs.lactateTrend === 'rising') trajectory.push('• Lactato ascendente')
  if (inputs.vasoTrend === 'rising') trajectory.push('• Aumento de requerimientos vasoactivos')

  let stewartEnhanced = (acidBase?.summary || []).filter(
    (s) =>
      !s.includes('El lactato explica gran parte del componente de UI; persiste un residual') &&
      !s.includes('UI residual leve tras lactato')
  )

  const hasEnrichedUnmeasuredAnionsMessage = stewartEnhanced.some(
    (s) => s.includes('🧪') && s.includes('aniones no medidos')
  )

  if (arc?.unexplainedAcidosis && !hasEnrichedUnmeasuredAnionsMessage) {
    stewartEnhanced.push(
      'Persistencia de acidosis residual no completamente explicada por lactato, compatible con aniones no medidos adicionales en este contexto clínico.'
    )
  }

  if (arc?.level === 'red') {
    const highPriorityItems = stewartEnhanced.filter(
      (s) =>
        s.includes('no completamente explicada por lactato') ||
        s.includes('aniones no medidos')
    )

    const respiratoryItems = stewartEnhanced.filter(
      (s) =>
        s.includes('Compensación respiratoria') ||
        s.includes('PCO₂') ||
        s.includes('alcalosis respiratoria') ||
        s.includes('acidosis respiratoria')
    )

    const intermediateItems = stewartEnhanced.filter(
      (s) =>
        !highPriorityItems.includes(s) &&
        !respiratoryItems.includes(s)
    )

    stewartEnhanced = [
      ...highPriorityItems,
      ...intermediateItems,
      ...respiratoryItems
    ]
  }

  return [
    'ARC SAFETY ASSISTANT',
    `Fecha/hora: ${timestamp}`,
    '',
    'Estado:',
    arc?.status || '🟢 Bajo riesgo',
    arc?.title || '',
    `Ratio tCa/iCa: ${ratioText}`,
    '',
    'Trayectoria fisiopatológica:',
    trajectory.length ? trajectory.join(NL) : '• Sin señales dinámicas relevantes',
    '',
    '¿Por qué?',
    whySummary,
    '',
    'Stewart Light:',
    stewartEnhanced.map((item) => `• ${item}`).join(NL),
    '',
    'Acción sugerida:',
    arc?.action || 'Continuar monitorización habitual según protocolo.',
    '',
    'Confianza fisiopatológica:',
    arc?.confidence || 'Alta si la evolución permanece estable.'
  ].join(NL)
}

async function copyTextSafe(text) {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fallback below
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  return ok
}

function Card({ title, children }) {
  return (
    <div className="rounded-[28px] border border-slate-700/40 bg-slate-900/70 backdrop-blur-xl shadow-2xl p-5">
      <h3 className="text-slate-200 text-lg font-semibold mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Metric({ label, value, color, text }) {
  return (
    <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4 flex items-start gap-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-950/50 flex items-center justify-center shrink-0 border border-slate-700">
        <span className={`${color} font-bold`}>{label.replace('SBE_', '')}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-slate-100">{label}</div>
          <div className={`${color} font-bold text-lg`}>{fmt(value)}</div>
        </div>
        <div className="text-slate-400 text-sm mt-1">{text}</div>
      </div>
    </div>
  )
}

export default function ArcSafetyPremiumMockup() {
  const [mode, setMode] = useState('clinical')
  const [draftInputs, setDraftInputs] = useState(INITIAL_INPUTS)
  const [inputs, setInputs] = useState(INITIAL_INPUTS)
  const [timeline, setTimeline] = useState(() => {
    try {
      const saved = window.localStorage.getItem('arc_safety_timeline_v1')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setInputs(draftInputs), 350)
    return () => clearTimeout(timeout)
  }, [draftInputs])

  useEffect(() => {
    if (typeof console !== 'undefined') console.info('ARC Safety self-test cases loaded:', CLINICAL_TEST_CASES.length)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem('arc_safety_timeline_v1', JSON.stringify(timeline))
    } catch {
      // localStorage unavailable
    }
  }, [timeline])

  const set = (key, value) => setDraftInputs((prev) => ({ ...prev, [key]: value }))
  const acidBase = useMemo(() => computeAcidBase(inputs), [inputs])
  const arc = useMemo(() => computeArc(inputs, acidBase), [inputs, acidBase])

  const heroLevel = inputs.crrtArc ? (arc?.level || 'green') : 'green'
  const heroClasses = {
    red: 'from-red-950/80 to-slate-950 border-red-800/50 shadow-[0_0_60px_rgba(127,29,29,0.25)]',
    amber: 'from-amber-950/70 to-slate-950 border-amber-800/50 shadow-[0_0_60px_rgba(146,64,14,0.22)]',
    green: 'from-emerald-950/70 to-slate-950 border-emerald-800/50 shadow-[0_0_60px_rgba(6,95,70,0.22)]'
  }[heroLevel]
  const accent = { red: 'text-red-300', amber: 'text-amber-300', green: 'text-emerald-300' }[heroLevel]

  const saveCurrentControl = () => {
    if (!acidBase || !arc) return
    const control = {
      id: Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      lactate: acidBase.lactate,
      ratio: arc.ratio,
      caIonico: n(inputs.caIonico),
      calciumIv: n(inputs.calciumIv),
      sbe: acidBase.sbe,
      ph: acidBase.ph,
      level: arc.level,
      status: arc.status,
      title: arc.title,
      highRiskContext: inputs.highRiskContext,
      technicalAlarm: inputs.technicalAlarm,
      ratioTrend: inputs.ratioTrend,
      lactateTrend: inputs.lactateTrend,
      vasoTrend: inputs.vasoTrend
    }
    setTimeline((prev) => [...prev, control])
  }

  const resetTimeline = () => setTimeline([])

  const timelineAnalysis = useMemo(() => computeLongitudinalTrajectory(timeline), [timeline])

  const copyClinicalSummary = async () => {
    const text = makeClipboardText(inputs, acidBase, arc)
    const ok = await copyTextSafe(text)
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(false), 2200)
  }

  const renderField = (id, label) => (
    <div>
      <label className="block text-slate-300 text-sm mb-2 font-medium">{label}</label>
      <input value={draftInputs[id]} onChange={(e) => set(id, e.target.value)} inputMode="decimal" className="w-full rounded-2xl bg-slate-800 border border-slate-700 px-4 py-4 text-slate-100 text-lg focus:outline-none focus:ring-2 focus:ring-cyan-600 transition" />
    </div>
  )

  const Chip = ({ children, active, onClick, tone = 'cyan' }) => {
    const activeClass = tone === 'red' ? 'bg-red-900/40 border-red-700 text-red-200' : tone === 'amber' ? 'bg-amber-900/40 border-amber-700 text-amber-200' : 'bg-cyan-900/40 border-cyan-700 text-cyan-200'
    return <button onClick={onClick} className={`rounded-2xl px-4 py-3 text-left transition border ${active ? activeClass : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>{children}</button>
  }

  const TrendRow = ({ label, id }) => (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4 flex items-center justify-between gap-3">
      <div className="text-slate-200 font-medium">{label}</div>
      <div className="flex gap-2">
        <Chip active={inputs[id] === 'stable'} onClick={() => set(id, 'stable')}>⬇ Estable</Chip>
        <Chip active={inputs[id] === 'rising'} onClick={() => set(id, 'rising')} tone="red">⬆ Ascendente</Chip>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-10">
        <div className="rounded-[34px] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 border border-slate-700/50 p-6 shadow-[0_0_80px_rgba(15,23,42,0.5)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-cyan-300 text-sm font-medium mb-2"><span>Stewart Light</span><span>•</span><span>TCRR / ARC Safety Monitor</span></div>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight">ARC Safety Assistant</h1>
              <div className="mt-3 text-sm text-slate-400">Version v4.5 Expert Review · Educational & Research Use Only</div>
              <p className="text-slate-400 mt-2 max-w-xl">Asistente clínico bedside para razonamiento fisiopatológico del equilibrio ácido–base y seguridad de ARC.</p>
            </div>
            <div className="bg-slate-900/70 border border-slate-700 rounded-3xl p-2 flex gap-2 self-start">
              <button onClick={() => setMode('clinical')} className={`px-5 py-3 rounded-2xl font-semibold ${mode === 'clinical' ? 'bg-cyan-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>🩺 Clínico</button>
              <button onClick={() => setMode('teaching')} className={`px-5 py-3 rounded-2xl font-semibold ${mode === 'teaching' ? 'bg-cyan-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>🎓 Docente</button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-6 mt-6">
          <div className="space-y-5">
            <Card title="Gasometría arterial"><div className="grid grid-cols-2 gap-4">{renderField('ph', 'pH')}{renderField('pco2', 'pCO₂')}{renderField('hco3', 'HCO₃⁻')}{renderField('sbe', 'SBE')}</div></Card>
            <Card title="Electrolitos y metabolismo"><div className="grid grid-cols-2 gap-4">{renderField('na', 'Na⁺')}{renderField('cl', 'Cl⁻')}{renderField('alb', 'Albúmina (g/L)')}{renderField('lactate', 'Lactato')}</div></Card>

            <Card title="ARC Safety Monitor">
              <div className="flex items-center justify-between rounded-2xl bg-slate-800 p-4 mb-5 border border-slate-700">
                <div><div className="font-semibold">TCRR + ARC</div><div className="text-slate-400 text-sm">Activar módulo de seguridad de citrato</div></div>
                <button onClick={() => set('crrtArc', !inputs.crrtArc)} className={`w-16 h-9 rounded-full relative transition ${inputs.crrtArc ? 'bg-cyan-700' : 'bg-slate-700'}`}><div className={`absolute top-1 w-7 h-7 rounded-full bg-white transition ${inputs.crrtArc ? 'right-1' : 'left-1'}`} /></button>
              </div>
              {inputs.crrtArc && <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">{renderField('caTotal', 'Ca total')}{renderField('caIonico', 'Ca iónico')}{renderField('calciumIv', 'Calcio IV (mmol/h)')}</div>
                <div className="space-y-3"><div className="text-slate-300 font-medium">Tendencias fisiopatológicas</div><TrendRow label="Ratio tCa/iCa" id="ratioTrend" /><TrendRow label="Lactato" id="lactateTrend" /><TrendRow label="Vasopresores / inotropos" id="vasoTrend" /></div>
                <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4 flex items-center justify-between"><div><div className="font-medium">Alto riesgo metabólico</div><div className="text-sm text-slate-400">Shock / hipoperfusión / hígado / ECMO</div></div><button onClick={() => set('highRiskContext', !inputs.highRiskContext)} className={`w-12 h-7 rounded-full relative ${inputs.highRiskContext ? 'bg-cyan-700' : 'bg-slate-700'}`}><div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition ${inputs.highRiskContext ? 'right-1' : 'left-1'}`} /></button></div>
                <div><div className="text-slate-300 font-medium mb-3">Check técnico de infusión de calcio</div><div className="grid grid-cols-1 gap-2"><Chip active={inputs.technicalAlarm === 'no'} onClick={() => set('technicalAlarm', 'no')}>Check correcto / sin incidencias</Chip><Chip active={inputs.technicalAlarm === 'yes_unchecked'} onClick={() => set('technicalAlarm', 'yes_unchecked')} tone="amber">No verificado todavía</Chip><Chip active={inputs.technicalAlarm === 'yes_checked'} onClick={() => set('technicalAlarm', 'yes_checked')} tone="red">Check correcto, pero persiste hipocalcemia</Chip></div></div>
                <div className={`rounded-2xl border p-4 flex items-center justify-between ${arc?.unexplainedAcidosis ? 'border-red-900/40 bg-red-950/20' : 'border-emerald-900/40 bg-emerald-950/20'}`}><div><div className={`font-medium ${arc?.unexplainedAcidosis ? 'text-red-200' : 'text-emerald-200'}`}>Acidosis no explicada por lactato</div><div className="text-sm text-slate-400">Señal mayor ARC · autodetectada desde Stewart Light</div></div><div className={`text-sm font-bold ${arc?.unexplainedAcidosis ? 'text-red-300' : 'text-emerald-300'}`}>{arc?.unexplainedAcidosis ? 'ON' : 'OFF'}</div></div>
              </div>}
            </Card>
          </div>

          <div className="space-y-5 lg:sticky lg:top-6 h-fit">
            <div className={`rounded-[34px] bg-gradient-to-br ${heroClasses} p-6`}>
              <div className={`${accent} text-sm uppercase tracking-[0.2em] font-semibold mb-3`}>{inputs.crrtArc ? 'ARC Safety' : 'Equilibrio ácido–base'}</div>
              <div className="text-4xl md:text-5xl font-black tracking-tight text-white">{inputs.crrtArc ? (arc?.status || '🟢 Bajo riesgo') : 'Stewart Light'}</div>
              <div className="mt-4"><div className="text-xl font-semibold text-slate-100 leading-tight">{inputs.crrtArc ? (arc?.title || 'Patrón compatible con metabolismo adecuado del citrato') : 'Interpretación fisiopatológica del trastorno metabólico'}</div>{inputs.crrtArc && arc && <p className="text-slate-300 text-lg mt-3 leading-relaxed">Ratio tCa/iCa = {fmt(arc.ratio, 2)}</p>}{!inputs.crrtArc && acidBase && <p className="text-slate-300 text-lg mt-3 leading-relaxed">{acidBase.resp}</p>}</div>
              <div className="mt-5 rounded-[24px] border border-cyan-900/30 bg-cyan-950/20 p-5"><div className="text-cyan-300 font-semibold mb-2">Acción sugerida</div><div className="text-slate-300 leading-7">{inputs.crrtArc ? (arc?.action || 'Continuar monitorización habitual según protocolo.') : 'Integrar el patrón Stewart Light con la situación clínica, tendencia evolutiva y causa probable del trastorno ácido–base.'}</div></div>
              <div className="mt-6 rounded-[28px] bg-slate-900/50 border border-slate-700 p-5"><div className="font-semibold text-cyan-300 mb-3">¿Por qué?</div><div className="space-y-3">{(inputs.crrtArc ? (arc?.why?.length ? arc.why : ['Sin señales dinámicas de alarma']) : (acidBase?.summary?.length ? acidBase.summary : ['Sin interpretación disponible'])).map((item) => <div key={item} className="flex items-start gap-3 text-slate-200"><div className={`w-2.5 h-2.5 rounded-full mt-2 ${heroLevel === 'red' ? 'bg-red-400' : heroLevel === 'amber' ? 'bg-amber-400' : 'bg-emerald-400'}`} /><span>{item}</span></div>)}</div></div>
              <div className="mt-5 rounded-[24px] border border-emerald-900/30 bg-emerald-950/20 p-4 flex items-center justify-between gap-4"><div><div className="text-emerald-300 font-semibold">Confianza fisiopatológica</div><div className="text-slate-400 text-sm mt-1">{inputs.crrtArc ? (arc?.confidence || 'Alta si la evolución permanece estable.') : 'Interpretación basada en Boston, SID, albúmina y componente de iones no medidos.'}</div></div><div className="text-emerald-300 font-bold text-lg shrink-0">{inputs.crrtArc ? (heroLevel === 'red' ? 'Alta' : heroLevel === 'amber' ? 'Cautela' : 'Estable') : 'Explicable'}</div></div>
            </div>

            <div className="rounded-[28px] border border-slate-700 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between"><div><div className="text-lg font-semibold">Interpretación fisiopatológica integrada</div><div className="text-slate-400 text-sm mt-1">Resumen bedside listo para sesión clínica</div></div><button onClick={copyClinicalSummary} className={`rounded-2xl px-4 py-2 font-medium transition ${copied === 'ok' ? 'bg-emerald-700 text-white' : copied === 'fail' ? 'bg-red-700 text-white' : 'bg-cyan-700 text-white hover:bg-cyan-600'}`}>{copied === 'ok' ? '✅ Resumen copiado' : copied === 'fail' ? '⚠️ No se pudo copiar' : '📋 Copiar'}</button></div>
              <p className="mt-4 text-slate-300 leading-7">{inputs.crrtArc ? (arc?.level === 'red' ? 'Paciente con patrón dinámico compatible con metabolismo insuficiente del citrato en contexto de TCRR + ARC. La sospecha se apoya en la convergencia de señales mayores y dinámicas, no en un único valor aislado. Considerar suspensión de ARC o transición temporal a otra estrategia de anticoagulación si el patrón progresa o no revierte tras optimización hemodinámica y revisión técnica.' : arc?.level === 'amber' ? 'Existen señales de vigilancia que aconsejan reevaluación precoz y seguimiento de tendencia antes de asumir acumulación de citrato.' : 'El patrón actual es compatible con metabolismo adecuado del citrato en este control, siempre integrado con contexto clínico y tendencia evolutiva.') : (acidBase?.summary?.join(' ') || 'Interpretación ácido–base no disponible.')}</p>
            </div>

            {inputs.crrtArc && <div className="rounded-[28px] border border-slate-700 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between mb-4 gap-4"><div><div className="text-lg font-semibold">ARC Timeline</div><div className="text-slate-400 text-sm mt-1">Controles seriados · la acumulación de citrato es una trayectoria</div></div><div className="flex gap-2"><button onClick={saveCurrentControl} className="rounded-2xl px-3 py-2 bg-cyan-700 text-sm font-medium">➕ Guardar</button><button onClick={resetTimeline} className="rounded-2xl px-3 py-2 bg-slate-800 border border-slate-700 text-sm font-medium">🗑 Reiniciar</button></div></div>
              {timeline.length === 0 ? <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4 text-slate-400 text-sm leading-6">Guarda el control actual para iniciar la evolución. No se almacenan datos identificativos.</div> : <div className="space-y-2"><div className="grid grid-cols-8 gap-2 text-xs text-slate-400 mb-2"><div>Hora</div><div className="text-center">Lactato</div><div className="text-center">tCa/iCa</div><div className="text-center">Ca IV</div><div className="text-center">SBE</div><div className="text-center">Riesgo</div><div className="text-center">Contexto</div><div className="text-center">Técnica</div></div>{timeline.map((point) => <div key={point.id} className="grid grid-cols-8 gap-2 items-center rounded-2xl bg-slate-800 border border-slate-700 px-3 py-3 text-sm"><div className="font-medium text-slate-200">{point.time}</div><div className="text-center text-slate-300">{fmt(point.lactate, 1)}</div><div className="text-center text-slate-300">{fmt(point.ratio, 2)}</div><div className="text-center text-slate-300">{fmt(point.calciumIv, 1)}</div><div className="text-center text-slate-300">{fmt(point.sbe, 1)}</div><div className={`text-center text-xs font-medium ${point.level === 'red' ? 'text-red-300' : point.level === 'amber' ? 'text-amber-300' : 'text-emerald-300'}`}>{point.status}</div><div className="text-center text-xs text-slate-300">{point.highRiskContext ? '⚠ Riesgo' : '—'}</div><div className="text-center text-xs text-slate-300">{point.technicalAlarm === 'yes_unchecked' ? '⚠ No verif.' : point.technicalAlarm === 'yes_checked' ? '🔴 Persiste' : '✔ OK'}</div></div>)}</div>}
              <div className={`mt-4 rounded-2xl border p-4 ${timelineAnalysis.level === 'red' ? 'border-red-900/30 bg-red-950/20' : timelineAnalysis.level === 'amber' ? 'border-amber-900/30 bg-amber-950/20' : timelineAnalysis.level === 'green' ? 'border-emerald-900/30 bg-emerald-950/20' : 'border-slate-700 bg-slate-800'}`}><div className={`${timelineAnalysis.level === 'red' ? 'text-red-300' : timelineAnalysis.level === 'amber' ? 'text-amber-300' : timelineAnalysis.level === 'green' ? 'text-emerald-300' : 'text-slate-300'} font-semibold mb-1`}>{timelineAnalysis.title}</div><div className="text-slate-300 text-sm leading-6">{timelineAnalysis.text}</div></div>
              <div className="mt-3 rounded-2xl border border-cyan-900/30 bg-cyan-950/20 p-4"><div className="text-cyan-300 font-semibold mb-1">Regla de seguridad</div><div className="text-slate-300 text-sm leading-6">El aumento de compensación de calcio IV no implica acumulación por sí solo: primero verificar concentración, bomba, velocidad, vía, conexión, permeabilidad y extravasación.</div></div>
            </div>}

            <div className="rounded-[28px] border border-slate-700 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between mb-4"><div><div className="font-semibold text-lg">Equilibrio ácido–base</div><div className="text-slate-400 text-sm">Motor fisiopatológico que alimenta ARC Safety</div></div><div className="text-cyan-300 font-medium">{mode === 'teaching' ? 'Docente' : 'Expandir'}</div></div>
              {acidBase && <div className="space-y-3"><div className="rounded-[24px] border border-slate-700 bg-slate-900/60 p-4"><div className="font-medium text-slate-200 mb-4">Resumen metabólico (Stewart Light)</div><div className="space-y-3"><div className="rounded-2xl bg-slate-800 border border-slate-700 p-4 flex items-start gap-4"><div className="text-2xl">🫁</div><div><div className="font-medium text-slate-100">Boston · pCO₂ esperada {fmt(acidBase.expectedPco2)} ±2</div><div className="text-slate-400 text-sm mt-1">{acidBase.resp}</div></div></div><Metric label="SBE_SID" value={acidBase.sbeSid} color="text-cyan-300" text={acidBase.sbeSid <= -3 ? 'Acidosis por bajo SID / hipercloremia relativa' : acidBase.sbeSid >= 3 ? (inputs.crrtArc && acidBase.ph > 7.45 && acidBase.hco3 > 30 ? 'Alto SID en TCRR + ARC: compatible con exceso de carga tampón por citrato adecuadamente metabolizado' : 'Alcalosis por alto SID / hipocloremia relativa') : 'Efecto SID pequeño'} /><Metric label="SBE_Alb" value={acidBase.sbeAlb} color="text-amber-300" text={acidBase.sbeAlb >= 2 ? 'Hipoalbuminemia con efecto alcalinizante' : 'Efecto de albúmina pequeño'} /><Metric label="SBE_UI" value={acidBase.sbeUi} color="text-red-300" text={acidBase.unexplainedAcidosis ? 'Aniones no medidos residuales tras lactato' : acidBase.sbeUi <= -4 && Number.isFinite(acidBase.lactate) && acidBase.lactate >= 2 && Math.abs(acidBase.uiResidual) < 3 ? 'Componente UI dominante explicado predominantemente por lactato' : Number.isFinite(acidBase.uiResidual) && acidBase.uiResidual <= -4 && acidBase.uiResidual > -6 ? `Residual moderado tras lactato ≈ ${fmt(acidBase.uiResidual)}` : 'Componente UI no dominante'} /></div></div>{mode === 'teaching' && <div className="rounded-2xl border border-cyan-900/30 bg-cyan-950/20 p-4 text-sm text-slate-300 leading-6"><div className="text-cyan-300 font-semibold mb-1">Modo docente</div><div>SBE_SID = (Na−Cl) − referencia pH-ajustada = {fmt(acidBase.naCl)} − {fmt(acidBase.sidRef)} = {fmt(acidBase.sbeSid)}</div><div>SBE_Alb = 0.3 × (40 − albúmina) = {fmt(acidBase.sbeAlb)}</div><div>SBE_UI = SBE − SBE_SID − SBE_Alb = {fmt(acidBase.sbeUi)}</div><div>UI residual tras lactato ≈ {fmt(acidBase.uiResidual)}</div></div>}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
