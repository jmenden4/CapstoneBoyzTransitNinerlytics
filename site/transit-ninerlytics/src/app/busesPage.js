import { useContext, useState, useReducer} from 'react'
import Table from 'react-bootstrap/Table'
import THSortable from './tables.js'
import {AppContext} from '../App.js'
import Gradient from '../gradient'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Modal from 'react-bootstrap/Modal'
import { dateToISO, timeToHHMMSS, daysBetween, fromLocalStorage } from '../utility'



// color scale to use on data
const intensityGradient = new Gradient(['ffffff', 'ffa600'])


// Main Bus page component
const BusesPage = () => {
    // get required data from App
    const {dataFilter, routes, buses, busData, sendNotification} = useContext(AppContext)

    // store current sorting for table
    const [sortState, setSortState] = useState({
        key: 'name',
        ascending: true,
    })

    // to keep track of number of days in filter
    let numDays = null

    // organize data by bus id
    const dataByBus = {}
    if(busData != null && dataFilter != null) {
        // calculate number of days currently considered in the data
        const {minDate, maxDate} = dataFilter
        numDays = daysBetween(minDate, maxDate) + 1

        busData.forEach(x => {
            dataByBus[x.id] = x
        })
        // get range of miles
        const eachMiles = busData.map(x => x.distance_from_last)
        const minMiles = Math.min(...eachMiles)
        const maxMiles = Math.max(...eachMiles)
        // assign relative values and colors
        Object.values(dataByBus).forEach(x => {
            x.relativeMiles = (x.distance_from_last - minMiles) / (maxMiles - minMiles)
            x.relativeMilesColor = intensityGradient.colorAt(x.relativeMiles)
        })
    }

    // combine buses with their data by id
    const busesWithData = buses.map(bus => {
        return {
            bus,
            data: dataByBus[bus.id],
        }
    })
    
    // define order of rows for the table based on current sort state (which column, ascending/descending)
    const tableOrderRows = [...busesWithData].sort((a, b) => {
        const {key, ascending} = sortState
        let result = 0
        if(key != 'name') {
            if(a.data && b.data) {
                switch(key) {
                    // set comparison directly based on stop information
                    case 'stops': {
                        result = a.data.num_times_stopped - b.data.num_times_stopped
                        break
                    }
                    case 'people_on': {
                        result = a.data.total_people_on - b.data.total_people_on
                        break
                    }
                    case 'people_off': {
                        result = a.data.total_people_off - b.data.total_people_off
                        break
                    }
                    case 'miles':
                    case 'avg_miles': {
                        result = a.data.distance_from_last - b.data.distance_from_last
                        break
                    }
                    case 'refuel':
                    case 'oil_change':
                    case 'inspection': {
                        result = 1 / a.data.distance_from_last - 1 / b.data.distance_from_last
                        break
                    }
                }
            } else if(a.data) {
                // force a to go before b (b doesn't have data)
                return -1
            } else if(b.data) {
                // force a to go after b (a doesn't have data)
                return 1
            }
        }
        // default name sort if tie
        if(result == 0) {
            result = parseInt(a.bus.code) - parseInt(b.bus.code)
        }
        return ascending ? result : -result
    })

    // store state for the maintenance interval editing popup
    const [intervalModalShown, setIntervalModalShown] = useState(false)
    const [modalValidated, setModalValidated] = useState(false)
    const [modalState, setModalState] = useState({})
    
    // store actual interval information and function to update
    const [intervals, updateIntervals] = useReducer((state, action) => {
        // update the value of an interval
        const {key, miles} = action
        state[key].miles = miles
        // try to store it in the browser so it stays across refreshes
        try {
            localStorage.setItem(state[key].storage_key, miles)
        } catch(e) {
            console.error(e)
        }
        return state
    }, [
        // define different intervals and default values or read from storage
        {
            key: 0,
            name: 'Refuel',
            message: 'Enter how far a bus can travel before refueling.',
            miles: fromLocalStorage('refuel_interval', 500),
            storage_key: 'refuel_interval',
        },
        {
            key: 1,
            name: 'Oil Change',
            message: 'Enter how far a bus can travel before needing an oil change.',
            miles: fromLocalStorage('oil_change_interval', 1000),
            storage_key: 'oil_change_interval',
        },
        {
            key: 2,
            name: 'Inspection',
            message: 'Enter how far a bus can travel before needing an inspection.',
            miles: fromLocalStorage('inspection_interval', 2000),
            storage_key: 'inspection_interval',
        },
    ])
    
    // high level function to show the popup for a specific interval
    const showIntervalModal = (interval) => {
        setModalState(interval)
        setIntervalModalShown(true)
        setModalValidated(false)
    }
  
    // when the user is done changing the value of an interval in the popup
    const onSubmit = e => {
        // don't refresh the page
        e.preventDefault()
        // read values
        const {key, miles} = modalState
        // validate the information
        const valid = e.target.checkValidity()
        if(valid) {
            // update the interval and hide popup if valid
            updateIntervals({key, miles})
            setIntervalModalShown(false)
        }
        // set validation results to show
        setModalValidated(true)
    }

    const MI_PER_KM = 0.621371
    tableOrderRows.forEach(x => {
        const {data} = x
        // if has data, store extra calculated columns
        if(data) {
            // store miles
            data.milesDriven = data.distance_from_last * MI_PER_KM
            data.avgMilesPerDay = data.milesDriven / numDays
            // calculate frequencies with the intervals
            intervals.forEach(interval => {
                data[interval.storage_key] = interval.miles / data.avgMilesPerDay
            })
        }
    })


    // when export button clicked
    const onExportClick = async e => {
        // get stops in order
        const sortedBuses = [...tableOrderRows].sort((a, b) => parseInt(a.bus.code) - parseInt(b.bus.code))
        
        // include header with parameters of filter
        const {minDate, maxDate, minTime, maxTime} = dataFilter
        let csvData = 'Transit Ninerlytics Export\n'
        csvData += `Dates: ${dateToISO(minDate)} - ${dateToISO(maxDate)} (${numDays} days)\n`
        csvData += `Times: ${timeToHHMMSS(minTime)} - ${timeToHHMMSS(maxTime)}\n`
        csvData += `Routes: ${routes.filter(x => dataFilter.routes.includes(x.id)).map(x => x.name).sort()}\n`
        csvData += `Buses: ${buses.filter(x => dataFilter.buses.includes(x.id)).map(x => x.code).sort()}\n`
        csvData += '\n'
        
        // add data column headers
        csvData += [
            'Bus Code',
            'NumTimesStopped',
            'TotalPeopleOn',
            'TotalPeopleOff',
            'MilesDriven',
            'AvgMilesPerDay',
        ].join('\t') + '\n'

        // add each bus's data
        sortedBuses.forEach(x => {
            const {bus, data} = x
            // start with bus information
            let values = [
                bus.code,
            ]
            if(data != null) {
                // add actual data values for this bus
                values = values.concat(
                    data.num_times_stopped,
                    data.total_people_on,
                    data.total_people_off,
                    data.milesDriven,
                    data.avgMilesPerDay,
                )
            } else {
                // add empty space because no data
                values = values.concat(
                    null,
                    null,
                    null,
                    null,
                    null,
                )
            }
            // add to csv data
            csvData += values.join('\t') + '\n'
        })

        // copy to clipboard
        try {
            await navigator.clipboard.writeText(csvData)
            sendNotification('success', 'Success', 'Data copied to clipboard!')
        } catch(err) {
            sendNotification('error', 'Error', 'Could not copy to clipboard!')
        }
    }


    return (
        <>
            <div style={{
                marginRight: 'auto',
                marginLeft: 'auto',
                maxWidth: 1200,
            }}>
                <Modal
                    show={intervalModalShown}
                    onHide={() => setIntervalModalShown(false)}
                    centered
                >
                    <Modal.Header>
                        <Modal.Title>{modalState.name} Interval</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Form noValidate validated={modalValidated} onSubmit={onSubmit}>
                            <div className="mb-2">
                                {modalState.message}
                            </div>
                            <Form.Text>
                                Distance (miles)
                            </Form.Text>
                            <Form.Group className="mb-3">
                                <Form.Control type="number" placeholder="Miles" min={1} required value={modalState.miles} onChange={e => {
                                    setModalState({
                                        ...modalState,
                                        miles: e.target.value,
                                    })
                                }} autoFocus/>
                                <Form.Control.Feedback type="invalid">
                                    Must be more than 0 miles.
                                </Form.Control.Feedback>
                            </Form.Group>
                            <Form.Group className="d-flex justify-content-end">
                                <Button type="submit">Done</Button>
                            </Form.Group>
                        </Form>  
                    </Modal.Body>
                </Modal>

                <div className="d-flex flex-row mt-5 mb-4">
                    <div className="d-flex align-items-center" style={{
                        width: '66.25%',
                    }}>
                        <span className="p-2 fw-bold">
                            Days: {numDays == null ? 'N/A' : numDays.toLocaleString()}
                        </span>
                    </div>
                    {intervals.map((x, i) => {
                        return (
                            <div key={i} className="d-flex" style={{width: '11.25%'}}>
                                <Button className="flex-grow-1 m-2" onClick={e => showIntervalModal(x)}>{x.miles} mi.</Button>
                            </div>
                        )
                    })}
                </div>

                <Table className="table table-bordered table-hover" style={{
                    tableLayout: 'fixed',
                }}>
                    <thead>
                        <tr>
                            <th className="bus-table-col1"></th>
                            <th colSpan="3"></th>
                            <th className="text-center" colSpan="2">Miles Driven</th>
                            <th className="text-center" colSpan="3">Maintenance Intervals (Days)</th>
                        </tr>
                        <tr>
                            <THSortable className="bus-table-col1" name="Bus" sortKey="name" defaultAscending sortState={sortState} setSortState={setSortState}/>
                            <THSortable name="Stops" sortKey="stops" sortState={sortState} setSortState={setSortState} alignRight/>
                            <THSortable name="People On" sortKey="people_on" sortState={sortState} setSortState={setSortState} alignRight/>
                            <THSortable name="People Off" sortKey="people_off" sortState={sortState} setSortState={setSortState} alignRight/>
                            <THSortable name="Total" sortKey="miles" sortState={sortState} setSortState={setSortState} alignRight/>
                            <THSortable name="Daily Avg" sortKey="avg_miles" sortState={sortState} setSortState={setSortState} alignRight/>
                            <THSortable name="Refuel" sortKey="refuel" defaultAscending sortState={sortState} setSortState={setSortState} alignRight/>
                            <THSortable name="Oil Change" sortKey="oil_change" defaultAscending sortState={sortState} setSortState={setSortState} alignRight/>
                            <THSortable name="Inspection" sortKey="inspection" defaultAscending sortState={sortState} setSortState={setSortState} alignRight/>
                        </tr>
                    </thead>
                    <tbody>
                        {tableOrderRows.map((x, i) => {
                            const {bus, data} = x
                            if(data != null) {
                                // normal row that shows all data if available
                                return (
                                    <tr key={i}>
                                        <td className="bus-table-col1">{bus.code}</td>
                                        <td className="text-end">{data.num_times_stopped.toLocaleString()}</td>
                                        <td className="text-end">{data.total_people_on.toLocaleString()}</td>
                                        <td className="text-end">{data.total_people_off.toLocaleString()}</td>
                                        <td className="text-end" style={{backgroundColor: data.relativeMilesColor}}>{data.milesDriven.toFixed(1)}</td>
                                        <td className="text-end">{data.avgMilesPerDay.toFixed(1)}</td>   
                                        {intervals.map((interval, i) => 
                                            <td key={i} className="text-end">{(data[interval.storage_key]).toFixed(1)}</td>
                                        )} 
                                    </tr>
                                )
                            } else {
                                // empty row with only bus code when no data
                                return (
                                    <tr key={i}>
                                        <td className="bus-table-col1">{bus.code}</td>
                                        <td className="text-end">-</td>
                                        <td className="text-end">-</td>
                                        <td className="text-end">-</td>
                                        <td className="text-end">-</td>
                                        <td className="text-end">-</td>    
                                        <td className="text-end">-</td>    
                                        <td className="text-end">-</td>    
                                        <td className="text-end">-</td>    
                                    </tr>
                                )
                            }
                            
                            
                        })}
                    </tbody>
                </Table>
            </div>
            <div className="export-container position-absolute bottom-0 mb-3">
                <Button 
                    disabled={busData == null}
                    onClick={onExportClick}>Export</Button>
            </div>
        </>
    )

}

export default BusesPage